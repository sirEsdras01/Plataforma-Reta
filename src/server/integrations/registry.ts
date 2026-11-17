import "server-only";
import { env } from "@/server/env";
import { ArxivProvider } from "./providers/arxiv";
import { CrossrefProvider } from "./providers/crossref";
import { GitHubProvider } from "./providers/github";
import { OpenAlexProvider } from "./providers/openalex";
import { YouTubeProvider } from "./providers/youtube";
import type { ProviderKey, ResourceProvider } from "./types";

let providers: Record<ProviderKey, ResourceProvider> | undefined;

export function getProviders(): Record<ProviderKey, ResourceProvider> {
  if (!providers) {
    const e = env();
    providers = {
      youtube: new YouTubeProvider(e.YOUTUBE_API_KEY),
      openalex: new OpenAlexProvider(e.OPENALEX_API_KEY),
      crossref: new CrossrefProvider(e.CONTACT_EMAIL),
      arxiv: new ArxivProvider(),
      github: new GitHubProvider(e.GITHUB_TOKEN),
    };
  }
  return providers;
}

export function getGitHub(): GitHubProvider {
  return getProviders().github as GitHubProvider;
}
