import { join } from "path";

// Parsed 13F filings, one file per accession number (gitignored). Shared by
// refresh-13f, which fills it, and watch-13f, which treats a filing with no
// cache entry as new. Bump the version on parser changes.
export const FILING_CACHE = join(process.cwd(), "data", "13f-cache", "v1");
