
export const agents = [
  {
    id: "web-scraper",
    name: "Web Scraper Agent",
    category: "scraping",
    description:
      "Extracts text, headings, descriptions, and links from public webpages.",
    endpoint: "/scrape",
    method: "POST",
    price: "0.001",
    currency: "USDC",
    network: "eip155:84532",
    payToEnv: "SELLER_ADDRESS",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", format: "uri" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        service: { type: "string" },
        url: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        headings: { type: "array" },
        text: { type: "string" },
        links: { type: "array" },
        scrapedAt: { type: "string" }
      }
    }
  },
  {
    id: "structured-data-extractor",
    name: "Structured Data Extractor",
    category: "data-processing",
    description:
      "Transforms supplied webpage data into structured JSON with field-presence indicators and a text preview.",
    endpoint: "/api/extract",
    method: "POST",
    price: "free",
    inputSchema: {
      type: "object",
      required: ["data"],
      properties: {
        data: {
          type: "object",
          description: "Previously scraped webpage data"
        }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        result: { type: "object" }
      }
    }
  }
];

export function getAgentById(id) {
  return agents.find((agent) => agent.id === id) ?? null;
}
