# High Availability Prometheus/Grafana Stack on Kubernetes

**Date:** 2026-01-07
**Purpose:** Comprehensive guide for making Prometheus/Grafana highly available on Kubernetes

---

## Architecture Overview

For maximum HA, use this stack:
- **Prometheus**: Multiple replicas with Thanos sidecar for deduplication
- **Thanos**: Query layer for global view + object storage for long-term retention
- **Alertmanager**: Clustered deployment (gossip protocol)
- **Grafana**: Multiple replicas with shared PostgreSQL + Redis

---

## 1. Prometheus HA Configuration

### Action 1.1: Deploy Prometheus with Multiple Replicas

```yaml
apiVersion: monitoring.coreos.com/v1
kind: Prometheus
metadata:
  name: prometheus-ha
  namespace: monitoring
spec:
  replicas: 2  # Minimum 2 for HA
  version: v2.48.0
  serviceAccountName: prometheus

  # CRITICAL: External labels for deduplication
  externalLabels:
    cluster: production
    replica: $(POD_NAME)

  # Enable Thanos sidecar
  thanos:
    version: v0.32.0
    objectStorageConfig:
      key: thanos.yaml
      name: thanos-objstore-config

  # Storage configuration
  retention: 24h  # Short retention, Thanos handles long-term
  storage:
    volumeClaimTemplate:
      spec:
        storageClassName: fast-ssd
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 100Gi

  # Resource allocation
  resources:
    requests:
      cpu: 2
      memory: 8Gi
    limits:
      cpu: 4
      memory: 16Gi

  # Anti-affinity (see section 4)
  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchLabels:
            app.kubernetes.io/name: prometheus
        topologyKey: kubernetes.io/hostname
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: prometheus
          topologyKey: topology.kubernetes.io/zone
```

### Action 1.2: Configure Thanos Object Storage

```yaml
# thanos-objstore-config Secret
apiVersion: v1
kind: Secret
metadata:
  name: thanos-objstore-config
  namespace: monitoring
stringData:
  thanos.yaml: |
    type: S3
    config:
      bucket: prometheus-thanos-metrics
      endpoint: s3.amazonaws.com
      region: us-west-2
      access_key: ${AWS_ACCESS_KEY_ID}
      secret_key: ${AWS_SECRET_ACCESS_KEY}
```

### Action 1.3: Deploy Thanos Query for Deduplication

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: thanos-query
  namespace: monitoring
spec:
  replicas: 3
  selector:
    matchLabels:
      app: thanos-query
  template:
    metadata:
      labels:
        app: thanos-query
    spec:
      containers:
      - name: thanos-query
        image: quay.io/thanos/thanos:v0.32.0
        args:
        - query
        - --log.level=info
        - --query.replica-label=replica  # CRITICAL: Dedup by replica label
        - --query.replica-label=prometheus_replica
        - --store=dnssrv+_grpc._tcp.thanos-sidecar.monitoring.svc
        - --store=dnssrv+_grpc._tcp.thanos-store.monitoring.svc
        ports:
        - name: http
          containerPort: 10902
        - name: grpc
          containerPort: 10901
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 2
            memory: 4Gi
```

### Action 1.4: Deploy Thanos Store Gateway (Long-term Storage)

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: thanos-store
  namespace: monitoring
spec:
  replicas: 2
  serviceName: thanos-store
  selector:
    matchLabels:
      app: thanos-store
  template:
    metadata:
      labels:
        app: thanos-store
    spec:
      containers:
      - name: thanos-store
        image: quay.io/thanos/thanos:v0.32.0
        args:
        - store
        - --data-dir=/var/thanos/store
        - --objstore.config-file=/etc/thanos/objstore.yaml
        - --index-cache-size=500MB
        - --chunk-pool-size=2GB
        volumeMounts:
        - name: data
          mountPath: /var/thanos/store
        - name: objstore-config
          mountPath: /etc/thanos
        resources:
          requests:
            cpu: 1
            memory: 4Gi
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 50Gi
```

### Action 1.5: Deploy Thanos Compactor (Single Instance)

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: thanos-compactor
  namespace: monitoring
spec:
  replicas: 1  # MUST be 1 - compactor is singleton
  serviceName: thanos-compactor
  selector:
    matchLabels:
      app: thanos-compactor
  template:
    metadata:
      labels:
        app: thanos-compactor
    spec:
      containers:
      - name: thanos-compactor
        image: quay.io/thanos/thanos:v0.32.0
        args:
        - compact
        - --data-dir=/var/thanos/compact
        - --objstore.config-file=/etc/thanos/objstore.yaml
        - --retention.resolution-raw=30d
        - --retention.resolution-5m=90d
        - --retention.resolution-1h=1y
        - --wait
```

---

## 2. Alertmanager HA Configuration

### Action 2.1: Deploy Clustered Alertmanager

```yaml
apiVersion: monitoring.coreos.com/v1
kind: Alertmanager
metadata:
  name: alertmanager-ha
  namespace: monitoring
spec:
  replicas: 3  # Odd number for quorum
  version: v0.26.0

  # Cluster configuration (automatic with Prometheus Operator)
  clusterAdvertiseAddress: ""  # Auto-detected

  # Storage for silences and notification log
  storage:
    volumeClaimTemplate:
      spec:
        storageClassName: fast-ssd
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi

  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchLabels:
            app.kubernetes.io/name: alertmanager
        topologyKey: kubernetes.io/hostname
```

### Action 2.2: Create Headless Service for Gossip

```yaml
apiVersion: v1
kind: Service
metadata:
  name: alertmanager-cluster
  namespace: monitoring
spec:
  clusterIP: None  # Headless for peer discovery
  selector:
    app.kubernetes.io/name: alertmanager
  ports:
  - name: tcp-mesh
    port: 9094
    targetPort: 9094
  - name: udp-mesh
    port: 9094
    protocol: UDP
    targetPort: 9094
```

---

## 3. Grafana HA Configuration

### Action 3.1: Deploy HA PostgreSQL Database

```yaml
# Using CloudNativePG or similar operator
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: grafana-db
  namespace: monitoring
spec:
  instances: 3
  primaryUpdateStrategy: unsupervised

  storage:
    size: 50Gi
    storageClass: fast-ssd

  postgresql:
    parameters:
      max_connections: "200"
      shared_buffers: "256MB"

  affinity:
    enablePodAntiAffinity: true
    topologyKey: kubernetes.io/hostname
```

### Action 3.2: Deploy Redis for Session/Cache

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: grafana-redis
  namespace: monitoring
spec:
  replicas: 3
  serviceName: grafana-redis
  selector:
    matchLabels:
      app: grafana-redis
  template:
    metadata:
      labels:
        app: grafana-redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        args:
        - --maxmemory
        - 256mb
        - --maxmemory-policy
        - allkeys-lru
        ports:
        - containerPort: 6379
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
```

### Action 3.3: Create Grafana ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-config
  namespace: monitoring
data:
  grafana.ini: |
    [server]
    root_url = https://grafana.example.com

    [database]
    type = postgres
    host = grafana-db-rw.monitoring.svc:5432
    name = grafana
    user = grafana
    password = ${GF_DATABASE_PASSWORD}
    ssl_mode = require

    [remote_cache]
    type = redis
    connstr = addr=grafana-redis.monitoring.svc:6379,pool_size=100,db=0

    [session]
    provider = redis
    provider_config = addr=grafana-redis.monitoring.svc:6379,pool_size=100,db=1

    [live]
    ha_engine = redis
    ha_engine_address = grafana-redis.monitoring.svc:6379

    [unified_alerting]
    enabled = true
    ha_peers = grafana-headless.monitoring.svc:9094
    ha_listen_address = ${POD_IP}:9094
    ha_advertise_address = ${POD_IP}:9094
```

### Action 3.4: Deploy Grafana Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
  namespace: monitoring
spec:
  replicas: 3
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      containers:
      - name: grafana
        image: grafana/grafana:10.2.0
        env:
        - name: POD_IP
          valueFrom:
            fieldRef:
              fieldPath: status.podIP
        - name: GF_DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: grafana-db-credentials
              key: password
        ports:
        - containerPort: 3000
        - containerPort: 9094  # HA alerting
        volumeMounts:
        - name: config
          mountPath: /etc/grafana/grafana.ini
          subPath: grafana.ini
        - name: provisioning
          mountPath: /etc/grafana/provisioning
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 2
            memory: 2Gi
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: config
        configMap:
          name: grafana-config
      - name: provisioning
        configMap:
          name: grafana-provisioning
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: grafana
            topologyKey: kubernetes.io/hostname
```

### Action 3.5: Create Headless Service for HA Alerting

```yaml
apiVersion: v1
kind: Service
metadata:
  name: grafana-headless
  namespace: monitoring
spec:
  clusterIP: None
  selector:
    app: grafana
  ports:
  - name: ha-alerting
    port: 9094
    targetPort: 9094
```

---

## 4. Kubernetes Infrastructure for HA

### Action 4.1: Configure Pod Anti-Affinity (All Components)

Add to all StatefulSets/Deployments:
```yaml
affinity:
  podAntiAffinity:
    # HARD requirement: Different nodes
    requiredDuringSchedulingIgnoredDuringExecution:
    - labelSelector:
        matchLabels:
          app.kubernetes.io/name: <component>
      topologyKey: kubernetes.io/hostname
    # SOFT preference: Different zones
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchLabels:
            app.kubernetes.io/name: <component>
        topologyKey: topology.kubernetes.io/zone
```

### Action 4.2: Create Pod Disruption Budgets

```yaml
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: prometheus-pdb
  namespace: monitoring
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: prometheus
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: alertmanager-pdb
  namespace: monitoring
spec:
  minAvailable: 2  # Maintain quorum
  selector:
    matchLabels:
      app.kubernetes.io/name: alertmanager
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: grafana-pdb
  namespace: monitoring
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: grafana
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: thanos-query-pdb
  namespace: monitoring
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: thanos-query
```

### Action 4.3: Create Priority Classes

```yaml
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: monitoring-critical
value: 1000000
globalDefault: false
description: "Critical monitoring components - Prometheus, Alertmanager"
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: monitoring-standard
value: 100000
globalDefault: false
description: "Standard monitoring components - Grafana, Thanos Query"
```

Apply to pods:
```yaml
spec:
  priorityClassName: monitoring-critical  # or monitoring-standard
```

### Action 4.4: Configure Network Policies

```yaml
---
# Default deny all ingress in monitoring namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: monitoring
spec:
  podSelector: {}
  policyTypes:
  - Ingress
---
# Allow Prometheus to scrape all namespaces
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-prometheus-scraping
  namespace: monitoring
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: prometheus
  policyTypes:
  - Egress
  egress:
  - to: []  # Allow all egress for scraping
    ports:
    - protocol: TCP
---
# Allow Grafana ingress from ingress controller
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-grafana-ingress
  namespace: monitoring
spec:
  podSelector:
    matchLabels:
      app: grafana
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
---
# Allow Alertmanager cluster communication
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-alertmanager-mesh
  namespace: monitoring
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: alertmanager
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app.kubernetes.io/name: alertmanager
    ports:
    - protocol: TCP
      port: 9094
    - protocol: UDP
      port: 9094
```

### Action 4.5: Create Dedicated Monitoring Node Pool

```bash
# Taint monitoring nodes
kubectl taint nodes <node-name> dedicated=monitoring:NoSchedule

# Label monitoring nodes
kubectl label nodes <node-name> node-type=monitoring
```

Add to monitoring workloads:
```yaml
spec:
  nodeSelector:
    node-type: monitoring
  tolerations:
  - key: "dedicated"
    operator: "Equal"
    value: "monitoring"
    effect: "NoSchedule"
```

### Action 4.6: Configure Resource Quotas

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: monitoring-quota
  namespace: monitoring
spec:
  hard:
    requests.cpu: "50"
    requests.memory: 200Gi
    limits.cpu: "100"
    limits.memory: 400Gi
    persistentvolumeclaims: "50"
    requests.storage: 5Ti
---
apiVersion: v1
kind: LimitRange
metadata:
  name: monitoring-limits
  namespace: monitoring
spec:
  limits:
  - default:
      cpu: 500m
      memory: 512Mi
    defaultRequest:
      cpu: 100m
      memory: 128Mi
    type: Container
```

### Action 4.7: Configure Storage Classes

```yaml
---
# Fast SSD for Prometheus/Thanos
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/gce-pd  # or aws-ebs, etc.
parameters:
  type: pd-ssd  # or gp3, etc.
  fsType: ext4
reclaimPolicy: Retain
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
---
# Standard SSD for Grafana/Alertmanager
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard-ssd
provisioner: kubernetes.io/gce-pd
parameters:
  type: pd-balanced
  fsType: ext4
reclaimPolicy: Retain
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

---

## 5. Loki HA for Logs (Optional)

### Action 5.1: Deploy Loki in Simple Scalable Mode

```bash
# Using Helm
helm upgrade --install loki grafana/loki \
  --namespace monitoring \
  --set deploymentMode=SimpleScalable \
  --set backend.replicas=3 \
  --set read.replicas=3 \
  --set write.replicas=3 \
  --set loki.storage.type=s3 \
  --set loki.storage.s3.endpoint=s3.amazonaws.com \
  --set loki.storage.s3.region=us-west-2 \
  --set loki.storage.s3.bucketNames.chunks=loki-chunks \
  --set loki.storage.s3.bucketNames.ruler=loki-ruler \
  --set loki.storage.s3.bucketNames.admin=loki-admin
```

---

## Actionable Checklist Summary

| # | Action | Priority | Complexity |
|---|--------|----------|------------|
| 1.1 | Deploy Prometheus with 2+ replicas + external labels | Critical | Medium |
| 1.2 | Configure Thanos object storage (S3/GCS) | Critical | Low |
| 1.3 | Deploy Thanos Query with replica deduplication | Critical | Medium |
| 1.4 | Deploy Thanos Store Gateway (2 replicas) | High | Medium |
| 1.5 | Deploy Thanos Compactor (singleton) | High | Low |
| 2.1 | Deploy Alertmanager cluster (3 replicas) | Critical | Low |
| 2.2 | Create headless service for gossip | Critical | Low |
| 3.1 | Deploy HA PostgreSQL for Grafana | Critical | High |
| 3.2 | Deploy Redis for sessions/cache | High | Low |
| 3.3 | Configure grafana.ini for HA | Critical | Medium |
| 3.4 | Deploy Grafana (3+ replicas) | Critical | Medium |
| 3.5 | Create headless service for HA alerting | High | Low |
| 4.1 | Configure pod anti-affinity (all components) | Critical | Low |
| 4.2 | Create Pod Disruption Budgets | Critical | Low |
| 4.3 | Create priority classes | High | Low |
| 4.4 | Configure network policies | Medium | Medium |
| 4.5 | Create dedicated monitoring node pool | Medium | Medium |
| 4.6 | Configure resource quotas | Medium | Low |
| 4.7 | Configure storage classes | High | Low |
| 5.1 | Deploy Loki in SimpleScalable mode | Optional | Medium |

---

## Key Takeaways

1. **Prometheus alone cannot deduplicate metrics from multiple replicas** - Thanos Query solves this with `--query.replica-label`
2. **Each Prometheus replica scrapes the same targets** - external labels distinguish them for deduplication
3. **Thanos Store Gateway reads from object storage** - enabling infinite retention beyond local disk
4. **Alertmanager uses gossip protocol** - odd replica count (3, 5) ensures quorum for consistency
5. **Grafana needs external database (not SQLite)** - PostgreSQL/MySQL required to share state across replicas
6. **Redis handles session stickiness** - so users can hit any Grafana pod without losing session
7. **Pod anti-affinity prevents single node/zone failure** - from taking down entire monitoring stack
8. **PDBs protect against cluster operations** - accidentally disrupting monitoring during maintenance

---

## Implementation Order

1. **Phase 1 - Critical Foundation**
   - Actions 1.1, 2.1, 4.1, 4.2
   - Basic HA with multiple replicas and anti-affinity

2. **Phase 2 - Long-term Storage**
   - Actions 1.2, 1.3, 1.4, 1.5
   - Thanos components for deduplication and retention

3. **Phase 3 - Grafana HA**
   - Actions 3.1, 3.2, 3.3, 3.4, 3.5
   - Full Grafana HA with PostgreSQL and Redis

4. **Phase 4 - Hardening**
   - Actions 4.3, 4.4, 4.5, 4.6, 4.7
   - Priority classes, network policies, dedicated nodes
