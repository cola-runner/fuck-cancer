export type SourceAuthority = "official" | "medical" | "web" | "user";

const OFFICIAL_DOMAINS = [
  "dailymed.nlm.nih.gov",
  "accessdata.fda.gov",
  "fda.gov",
  "medlineplus.gov",
  "clinicaltrials.gov",
  "nhc.gov.cn",
  "ema.europa.eu",
  "cancer.gov",
];

const MEDICAL_DOMAINS = [
  "pubmed.ncbi.nlm.nih.gov",
  "pmc.ncbi.nlm.nih.gov",
];

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function classifySourceAuthority(
  origin: string | null,
  sourceUrl: string | null
): SourceAuthority {
  if (origin === null) return "user";
  if (!sourceUrl) return "web";

  let hostname: string;
  try {
    hostname = new URL(sourceUrl).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "web";
  }

  if (OFFICIAL_DOMAINS.some((domain) => matchesDomain(hostname, domain))) {
    return "official";
  }
  if (MEDICAL_DOMAINS.some((domain) => matchesDomain(hostname, domain))) {
    return "medical";
  }
  return "web";
}
