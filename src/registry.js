
export const agents = [
  {
    id: "web-scraper",
    name: "Web Scraper Agent",
    category: "scraping",
    description: "Extracts text, headings, descriptions, and links from public webpages.",
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
  }
];

export function getAgentById(id) {
  return agents.find((agent) => agent.id === id) ?? null;
}
