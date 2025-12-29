#!/usr/bin/env bun
/**
 * news-digest - Aggregate world news from major outlets
 *
 * Fetches news from BBC, AP, Reuters, CNN, and Al Jazeera RSS feeds,
 * filters by time period, and provides summaries with supporting articles.
 */

const RSS_FEEDS = {
  bbc: {
    name: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
  },
  guardian: {
    name: "The Guardian",
    url: "https://www.theguardian.com/world/rss",
  },
  npr: {
    name: "NPR",
    url: "https://feeds.npr.org/1004/rss.xml",
  },
  aljazeera: {
    name: "Al Jazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
  },
  dw: {
    name: "Deutsche Welle",
    url: "https://rss.dw.com/rdf/rss-en-world",
  },
};

// Words that indicate sponsored/ad content
const AD_KEYWORDS = [
  "sponsored",
  "advertisement",
  "apr",
  "credit card",
  "loan",
  "lending",
  "mortgage",
  "fool.com",
  "lendingtree",
];

// Topic keywords for classification
const TOPIC_KEYWORDS: Record<string, string[]> = {
  conflict: ["war", "attack", "military", "killed", "troops", "missile", "strike", "conflict", "fighting", "soldier", "bomb", "weapon", "combat", "battle"],
  politics: ["president", "minister", "election", "government", "vote", "parliament", "summit", "diplomat", "treaty", "sanctions", "leader", "policy", "law"],
  economy: ["economy", "market", "trade", "stock", "inflation", "bank", "dollar", "oil", "price", "deal", "business", "finance", "gdp", "growth"],
  climate: ["climate", "weather", "flood", "storm", "earthquake", "wildfire", "carbon", "pollution", "environmental", "hurricane", "drought", "emissions"],
  health: ["health", "covid", "vaccine", "disease", "hospital", "medical", "research", "scientist", "discovery", "medicine", "virus", "pandemic"],
  tech: [" ai ", " ai,", " ai.", "artificial intelligence", "openai", "chatgpt", "claude ai", "gemini ai", "machine learning", "neural network", "generative ai", "cybersecurity", "cyberattack", "hacker", "ransomware", "data breach", "silicon valley", "semiconductor", "chipmaker", "nvidia", "tesla", "spacex", "elon musk", "zuckerberg", "cryptocurrency", "bitcoin", "blockchain", "robotics", "self-driving", "quantum computing", "smartphone", "iphone", "big tech", "tech giant", "tech company", "satellite", "spacecraft", "rocket launch"],
  sports: ["football", "soccer", "basketball", "tennis", "olympics", "championship", "tournament", "match", "game", "player", "team", "afcon", "world cup"],
};

const TOPIC_DISPLAY_NAMES: Record<string, string> = {
  conflict: "Conflict & Security",
  politics: "Politics & Diplomacy",
  economy: "Economy & Business",
  climate: "Climate & Environment",
  health: "Health & Science",
  tech: "Technology",
  sports: "Sports",
  other: "Other",
};

function getArticleTopic(article: Article): string {
  const text = (article.title + " " + article.description).toLowerCase();
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      return topic;
    }
  }
  return "other";
}

function filterByTopic(articles: Article[], topic: string): Article[] {
  return articles.filter(article => getArticleTopic(article) === topic);
}

interface Article {
  title: string;
  description: string;
  link: string;
  pubDate: Date;
  source: string;
}

interface NewsDigest {
  generatedAt: string;
  timeRange: string;
  totalArticles: number;
  sources: string[];
  summary: string;
  topStories: Article[];
  articles: Article[];
}

function parseTimeRange(since: string): Date {
  const now = new Date();
  const match = since.match(/^(\d+)?([hdw])$/i);

  if (!match) {
    throw new Error(`Invalid time range: ${since}. Use format like 1h, 24h, 1d, 7d, 1w`);
  }

  const amount = parseInt(match[1] || "1", 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "h":
      return new Date(now.getTime() - amount * 60 * 60 * 1000);
    case "d":
      return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
    case "w":
      return new Date(now.getTime() - amount * 7 * 24 * 60 * 60 * 1000);
    default:
      throw new Error(`Invalid time unit: ${unit}`);
  }
}

function extractCDATA(text: string): string {
  const cdataMatch = text.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return cdataMatch ? cdataMatch[1] : text;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRSS(xml: string, sourceName: string): Article[] {
  const articles: Article[] = [];

  // Match all <item> elements
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    // Extract fields
    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
    const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

    if (titleMatch) {
      const title = stripHtml(extractCDATA(titleMatch[1]));
      const description = descMatch ? stripHtml(extractCDATA(descMatch[1])) : "";
      const link = linkMatch ? extractCDATA(linkMatch[1]).trim() : "";
      const pubDateStr = pubDateMatch ? extractCDATA(pubDateMatch[1]).trim() : "";
      const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

      if (title && !isNaN(pubDate.getTime())) {
        articles.push({
          title,
          description: description.slice(0, 300) + (description.length > 300 ? "..." : ""),
          link,
          pubDate,
          source: sourceName,
        });
      }
    }
  }

  return articles;
}

async function fetchFeed(key: string, feed: { name: string; url: string }): Promise<Article[]> {
  try {
    const response = await fetch(feed.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) news-digest/1.0",
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${feed.name}: ${response.status}`);
      return [];
    }

    const xml = await response.text();
    return parseRSS(xml, feed.name);
  } catch (error) {
    console.error(`Error fetching ${feed.name}:`, error);
    return [];
  }
}

function generateSummary(articles: Article[]): string {
  if (articles.length === 0) {
    return "No recent news articles found for the specified time period.";
  }

  // Group articles by topic
  const topics: Map<string, Article[]> = new Map();

  for (const article of articles) {
    const topic = getArticleTopic(article);
    if (!topics.has(topic)) topics.set(topic, []);
    topics.get(topic)!.push(article);
  }

  // Generate summary text
  const lines: string[] = [];
  const sortedTopics = Array.from(topics.entries()).sort((a, b) => b[1].length - a[1].length);

  for (const [topic, topicArticles] of sortedTopics) {
    if (topicArticles.length > 0) {
      const displayName = TOPIC_DISPLAY_NAMES[topic] || topic;
      const topHeadlines = topicArticles
        .slice(0, 3)
        .map(a => a.title)
        .join("; ");
      lines.push(`**${displayName}** (${topicArticles.length} articles): ${topHeadlines}`);
    }
  }

  return lines.join("\n\n");
}

function formatPretty(digest: NewsDigest): string {
  const lines: string[] = [];

  lines.push("═".repeat(70));
  lines.push("                        WORLD NEWS DIGEST");
  lines.push("═".repeat(70));
  lines.push(`Generated: ${digest.generatedAt}`);
  lines.push(`Time Range: ${digest.timeRange}`);
  lines.push(`Sources: ${digest.sources.join(", ")}`);
  lines.push(`Total Articles: ${digest.totalArticles}`);
  lines.push("─".repeat(70));
  lines.push("");
  lines.push("SUMMARY");
  lines.push("─".repeat(70));
  lines.push(digest.summary.replace(/\*\*/g, ""));
  lines.push("");
  lines.push("─".repeat(70));
  lines.push("TOP STORIES");
  lines.push("─".repeat(70));

  for (let i = 0; i < digest.topStories.length; i++) {
    const article = digest.topStories[i];
    lines.push(`\n${i + 1}. [${article.source}] ${article.title}`);
    if (article.description) {
      lines.push(`   ${article.description}`);
    }
    lines.push(`   ${article.link}`);
  }

  if (digest.articles.length > digest.topStories.length) {
    lines.push("");
    lines.push("─".repeat(70));
    lines.push("MORE ARTICLES");
    lines.push("─".repeat(70));

    for (const article of digest.articles.slice(digest.topStories.length)) {
      lines.push(`• [${article.source}] ${article.title}`);
    }
  }

  lines.push("");
  lines.push("═".repeat(70));

  return lines.join("\n");
}

function printUsage(): void {
  console.log(`
news-digest - Aggregate world news from major outlets

USAGE:
  news-digest [OPTIONS]

OPTIONS:
  --since <time>     Time range: Nh (hours), Nd (days), Nw (weeks)
                     Examples: 1h, 6h, 24h, 1d, 7d, 1w (default: 24h)
  --articles <n>     Number of supporting articles (default: 10)
  --json             Output in JSON format (default: pretty)
  --sources <list>   Comma-separated sources to include
                     Options: bbc, guardian, npr, aljazeera, dw (default: all)
  --topic <topic>    Filter by topic (optional)
                     Options: conflict, politics, economy, climate, health, tech, sports
  --help, -h         Show this help message

TOPICS:
  conflict   War, military, attacks, security
  politics   Government, elections, diplomacy
  economy    Markets, trade, business, finance
  climate    Weather, environment, disasters
  health     Medicine, disease, research
  tech       Technology, AI, cyber, digital
  sports     Football, basketball, tournaments

SOURCES:
  bbc        BBC News World
  guardian   The Guardian World
  npr        NPR World News
  aljazeera  Al Jazeera
  dw         Deutsche Welle

EXAMPLES:
  news-digest                          # Last 24h, pretty format
  news-digest --since 6h               # Last 6 hours
  news-digest --since 1w --articles 20 # Last week, 20 articles
  news-digest --json                   # JSON output
  news-digest --sources bbc,reuters    # Only BBC and Reuters
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Parse arguments
  let since = "24h";
  let articleCount = 10;
  let jsonOutput = args.includes("--json");
  let selectedSources: string[] = Object.keys(RSS_FEEDS);

  const sinceIdx = args.indexOf("--since");
  if (sinceIdx !== -1 && args[sinceIdx + 1]) {
    since = args[sinceIdx + 1];
  }

  const articlesIdx = args.indexOf("--articles");
  if (articlesIdx !== -1 && args[articlesIdx + 1]) {
    articleCount = parseInt(args[articlesIdx + 1], 10);
    if (isNaN(articleCount) || articleCount < 1) {
      console.error("Invalid article count");
      process.exit(1);
    }
  }

  const sourcesIdx = args.indexOf("--sources");
  if (sourcesIdx !== -1 && args[sourcesIdx + 1]) {
    selectedSources = args[sourcesIdx + 1].split(",").map(s => s.trim().toLowerCase());
    for (const src of selectedSources) {
      if (!RSS_FEEDS[src as keyof typeof RSS_FEEDS]) {
        console.error(`Unknown source: ${src}`);
        console.error(`Valid sources: ${Object.keys(RSS_FEEDS).join(", ")}`);
        process.exit(1);
      }
    }
  }

  let selectedTopic: string | null = null;
  const topicIdx = args.indexOf("--topic");
  if (topicIdx !== -1 && args[topicIdx + 1]) {
    selectedTopic = args[topicIdx + 1].toLowerCase();
    const validTopics = [...Object.keys(TOPIC_KEYWORDS), "other"];
    if (!validTopics.includes(selectedTopic)) {
      console.error(`Unknown topic: ${selectedTopic}`);
      console.error(`Valid topics: ${validTopics.join(", ")}`);
      process.exit(1);
    }
  }

  const sinceDate = parseTimeRange(since);

  if (!jsonOutput) {
    console.error("Fetching news from sources...");
  }

  // Fetch all feeds in parallel
  const feedPromises = selectedSources.map(key =>
    fetchFeed(key, RSS_FEEDS[key as keyof typeof RSS_FEEDS])
  );

  const results = await Promise.all(feedPromises);

  // Combine and filter articles
  let allArticles: Article[] = results.flat();

  // Filter by date
  allArticles = allArticles.filter(a => a.pubDate >= sinceDate);

  // Filter out ads/sponsored content
  allArticles = allArticles.filter(article => {
    const text = (article.title + " " + article.description + " " + article.link).toLowerCase();
    return !AD_KEYWORDS.some(kw => text.includes(kw));
  });

  // Filter by topic if specified
  if (selectedTopic) {
    allArticles = filterByTopic(allArticles, selectedTopic);
  }

  // Sort by date (newest first)
  allArticles.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  // Remove duplicates (similar titles)
  const seen = new Set<string>();
  allArticles = allArticles.filter(article => {
    const key = article.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Generate digest
  const digest: NewsDigest = {
    generatedAt: new Date().toISOString(),
    timeRange: `Last ${since}` + (selectedTopic ? ` (${TOPIC_DISPLAY_NAMES[selectedTopic]})` : ""),
    totalArticles: allArticles.length,
    sources: selectedSources.map(s => RSS_FEEDS[s as keyof typeof RSS_FEEDS].name),
    summary: selectedTopic
      ? `Showing ${allArticles.length} articles about ${TOPIC_DISPLAY_NAMES[selectedTopic]}`
      : generateSummary(allArticles),
    topStories: allArticles.slice(0, Math.min(5, articleCount)),
    articles: allArticles.slice(0, articleCount),
  };

  // Output
  if (jsonOutput) {
    console.log(JSON.stringify(digest, null, 2));
  } else {
    console.log(formatPretty(digest));
  }
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
