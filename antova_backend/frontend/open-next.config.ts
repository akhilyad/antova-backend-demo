// OpenNext adapter config: builds this Next.js app into a Cloudflare Worker.
// No incremental cache: every page is static or rendered per request, nothing uses ISR.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
