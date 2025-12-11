#!/usr/bin/env node
/**
 * Domain Checker MCP Server
 *
 * Model Context Protocol server for domain availability checking and recommendations.
 * Uses WHOIS for definitive registration status (primary) with DNS fallback (secondary).
 * No API key required - completely free and accurate.
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { promises as dns } from 'dns';
import whoiser from 'whoiser';

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../../..');
config({ path: resolve(projectRoot, '.env') });

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Domain availability result
 */
interface DomainResult {
  domain: string;
  available: boolean;
  method: 'whois' | 'dns' | 'error';
  whois_data?: {
    registrar?: string;
    creation_date?: string;
    expiration_date?: string;
    status?: string[];
  };
  error?: string;
}

/**
 * Tool definitions
 */
const TOOLS = [
  {
    name: 'check_domain',
    description: 'Check if a single domain name is available for registration',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'The domain name to check (e.g., "example.com")',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'check_domains_batch',
    description: 'Check availability for multiple domain names at once',
    inputSchema: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of domain names to check (e.g., ["example.com", "example.org"])',
        },
      },
      required: ['domains'],
    },
  },
  {
    name: 'suggest_domains',
    description: 'Generate domain name suggestions based on keywords',
    inputSchema: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords to use for domain suggestions (e.g., ["tech", "startup"])',
        },
        tlds: {
          type: 'array',
          items: { type: 'string' },
          description: 'TLDs to check (default: ["com", "org", "net", "io", "app"])',
          default: ['com', 'org', 'net', 'io', 'app'],
        },
        count: {
          type: 'number',
          description: 'Maximum number of suggestions to return (default: 10)',
          default: 10,
        },
      },
      required: ['keywords'],
    },
  },
];

/**
 * Normalize domain name
 */
function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '');
}

/**
 * Check domain availability using WHOIS (with DNS fallback)
 * WHOIS provides definitive registration status.
 */
async function checkDomainAvailability(domain: string): Promise<DomainResult> {
  const normalized = normalizeDomain(domain);

  // Try WHOIS first (definitive)
  try {
    const whoisData = await whoiser(normalized, { timeout: 5000 });

    // whoiser returns data organized by WHOIS server
    const firstServer = Object.keys(whoisData)[0];
    const data = whoisData[firstServer];

    // Check for common "not found" indicators in WHOIS response
    const notFoundIndicators = [
      'No match for',
      'NOT FOUND',
      'No entries found',
      'No Data Found',
      'not found',
      'no match',
      'no entries',
      'available',
      'Status: free'
    ];

    // Convert data to string for searching
    const dataString = JSON.stringify(data).toLowerCase();
    const isAvailable = notFoundIndicators.some(indicator =>
      dataString.includes(indicator.toLowerCase())
    );

    if (isAvailable) {
      return {
        domain: normalized,
        available: true,
        method: 'whois',
      };
    }

    // Domain is registered - extract WHOIS data
    const extractField = (field: string): string | undefined => {
      if (typeof data === 'object' && data !== null) {
        const value = (data as Record<string, unknown>)[field];
        return value ? String(value) : undefined;
      }
      return undefined;
    };

    return {
      domain: normalized,
      available: false,
      method: 'whois',
      whois_data: {
        registrar: extractField('Registrar') || extractField('registrar'),
        creation_date: extractField('Creation Date') || extractField('created'),
        expiration_date: extractField('Expiry Date') || extractField('expires'),
        status: extractField('Domain Status') ? [extractField('Domain Status')!] : undefined,
      },
    };
  } catch (whoisError: unknown) {
    // WHOIS failed - fall back to DNS
    try {
      await dns.resolve4(normalized);
      // Domain resolves = registered
      return {
        domain: normalized,
        available: false,
        method: 'dns',
      };
    } catch (dnsError: unknown) {
      // DNS doesn't resolve
      const dnsErrCode = (dnsError as { code?: string }).code;
      if (dnsErrCode === 'ENOTFOUND' || dnsErrCode === 'ENODATA') {
        // Domain doesn't resolve = likely available
        return {
          domain: normalized,
          available: true,
          method: 'dns',
        };
      }

      // Both WHOIS and DNS failed
      const whoisMsg = whoisError instanceof Error ? whoisError.message : String(whoisError);
      const dnsMsg = dnsError instanceof Error ? dnsError.message : String(dnsError);

      return {
        domain: normalized,
        available: false,
        method: 'error',
        error: `WHOIS error: ${whoisMsg}; DNS error: ${dnsMsg}`,
      };
    }
  }
}

/**
 * Check multiple domains
 */
async function checkDomainsBatch(domains: string[]): Promise<DomainResult[]> {
  const promises = domains.map(domain => checkDomainAvailability(domain));
  return Promise.all(promises);
}

/**
 * Generate domain suggestions
 * Simple algorithm: combine keywords with common patterns and TLDs
 */
function generateDomainSuggestions(
  keywords: string[],
  tlds: string[],
  count: number
): string[] {
  const suggestions: string[] = [];

  const patterns = [
    (k: string[]) => k.join(''), // techstartup
    (k: string[]) => k.join('-'), // tech-startup
    (k: string[]) => `get${k.join('')}`, // gettechstartup
    (k: string[]) => `${k.join('')}hq`, // techstartuphq
    (k: string[]) => `${k.join('')}app`, // techstartupapp
    (k: string[]) => `${k.join('')}hub`, // techstartuphub
    (k: string[]) => `the${k.join('')}`, // thetechstartup
    (k: string[]) => `my${k.join('')}`, // mytechstartup
    (k: string[]) => `${k[0]}${k.slice(1).join('')}`, // first keyword + rest
  ];

  // Generate combinations
  for (const pattern of patterns) {
    const base = pattern(keywords);
    for (const tld of tlds) {
      suggestions.push(`${base}.${tld}`);
      if (suggestions.length >= count * 2) break; // Generate extras for filtering
    }
    if (suggestions.length >= count * 2) break;
  }

  // Return unique suggestions up to count
  return [...new Set(suggestions)].slice(0, count);
}

/**
 * Initialize MCP server
 */
async function main() {
  const server = new Server(
    {
      name: 'domain-checker-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'check_domain': {
          const domain = (args as { domain?: string })?.domain;
          if (!domain) {
            throw new Error('domain is required');
          }

          const result = await checkDomainAvailability(domain);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'check_domains_batch': {
          const domains = (args as { domains?: string[] })?.domains;
          if (!domains || !Array.isArray(domains) || domains.length === 0) {
            throw new Error('domains array is required and must not be empty');
          }

          const results = await checkDomainsBatch(domains);

          // Separate available and unavailable
          const available = results.filter(r => r.available);
          const unavailable = results.filter(r => !r.available);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    summary: {
                      total: results.length,
                      available: available.length,
                      unavailable: unavailable.length,
                    },
                    available_domains: available,
                    unavailable_domains: unavailable,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'suggest_domains': {
          const keywords = (args as { keywords?: string[] })?.keywords;
          const tlds = (args as { tlds?: string[] })?.tlds || ['com', 'org', 'net', 'io', 'app'];
          const count = (args as { count?: number })?.count || 10;

          if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            throw new Error('keywords array is required and must not be empty');
          }

          // Generate suggestions
          const suggestions = generateDomainSuggestions(keywords, tlds, count);

          // Check availability for suggestions
          const results = await checkDomainsBatch(suggestions);

          // Prioritize available domains
          const available = results.filter(r => r.available);
          const unavailable = results.filter(r => !r.available);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    keywords,
                    tlds,
                    suggestions: {
                      available: available.slice(0, count),
                      unavailable: unavailable.slice(0, 5), // Show a few unavailable as examples
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep process alive
  process.stdin.resume();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
