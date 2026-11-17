# MC GamerTime

[![CI](https://github.com/Strandgaard96/mc-gamertime/actions/workflows/ci.yml/badge.svg)](https://github.com/Strandgaard96/mc-gamertime/actions/workflows/ci.yml)
[![API coverage](https://codecov.io/gh/Strandgaard96/mc-gamertime/branch/main/graph/badge.svg?flag=api)](https://codecov.io/gh/Strandgaard96/mc-gamertime)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Strandgaard96/mc-gamertime/badge)](https://scorecard.dev/viewer/?uri=github.com/Strandgaard96/mc-gamertime)
[![Docker image](https://img.shields.io/badge/ghcr.io-strandgaard96%2Fmc--gamertime-2496ED?logo=docker&logoColor=white)](https://github.com/Strandgaard96/mc-gamertime/pkgs/container/mc-gamertime)
[![Release](https://img.shields.io/github/v/release/Strandgaard96/mc-gamertime)](https://github.com/Strandgaard96/mc-gamertime/releases)
[![License: MIT](https://img.shields.io/github/license/Strandgaard96/mc-gamertime)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-mcgamertime--docs.drmaggi.com-blue)](https://mcgamertime-docs.drmaggi.com)
[![Built with Claude Code](https://img.shields.io/badge/built%20with-Claude%20Code-8A2BE2)](#built-with-claude-code)

![Game catalog: Board Game Geek metadata, play counts and cover art](docs-site/src/assets/screenshot-catalog.webp)

**Board game inventory tracker and game logger**

## Features

| | |
|---|---|
| **Game catalog** | Search BoardGameGeek (including matching by expansion keywords), track player counts, complexity, BGG `boardgamecategory` values, cover art, and "New" badges for recent additions |
| **Expansions & rulebooks** | Search/add expansions per game and upload multiple PDF rulebooks with an inline pop-up PDF viewer |
| **Catalog stats & picker** | Dedicated Catalog Stats page (counts by category, player count, play time, complexity) and a Game Picker supporting `2`–`8+` players, last played, and searchable categories |
| **Personal & family libraries** | Private personal library created per user on join, plus shared family libraries with per-library roles (`owner`, `editor`, `readonly`) |
| **Authentication & OIDC SSO** | Local auth or OpenID Connect (OIDC) SSO via env vars, with an option (`DISABLE_LOCAL_AUTH`) to allow SSO-only sign-in |
| **Leaderboard** | Elo rating per player, win rates, streaks, head-to-head records |
| **Session log** | Any user can log sessions (scores, mood, photos, per-game custom fields); admins and session creators can edit |
| **Achievements** | Milestones detected automatically as results come in |
| **Player profiles** | Favourite game, nemesis, best month, Elo history |
| **Blog** | Session recaps with rich text and images |


Self-host it, or use the built-in support for serverless hosting on AWS for ≈$0 a month.

| | |
|---|---|
| ![The leaderboard: podium, Elo ratings per player, win rates and streaks](docs-site/src/assets/hero-leaderboard.png) | ![Player profile: win rate, streaks, favourite game and nemesis](docs-site/src/assets/screenshot-player.png) |



## Contents

- [Built with Claude Code](#built-with-claude-code)
- [Quick start](#quick-start)
  - [1. Self-hosted with Docker](#1-self-hosted-with-docker)
  - [2. Cloud-hosted on AWS](#2-cloud-hosted-on-aws)
- [Stack](#stack)
- [Contributing](#contributing)
- [License](#license)

## Built with Claude Code

> [!WARNING]
> The project is vibe-coded and should be treated as such.

Claude Code wrote most of the code. My background is scientific computing with extensive
AWS experience and I did this project to learn frontend coding and agent orchestration in a full-stack application.


I wanted to ensure that no data is compromised when using the AWS cloud option as it has public facing endpoints. The security model is explained here: [security model](https://mcgamertime-docs.drmaggi.com/self-hosting/security/).

The setup used to build it is in [CLAUDE.md](./CLAUDE.md), with these plugins:

- [superpowers](https://github.com/obra/superpowers) — brainstorming, subagent-driven development, TDD, systematic debugging
- [frontend-design](https://github.com/anthropics/claude-plugins-public/tree/main/plugins/frontend-design) — non-generic UI design guidance
- [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) — live browser inspection and automation

## Quick start

### 1. Self-hosted with Docker

**To install:**

```bash
curl -fsSL https://raw.githubusercontent.com/Strandgaard96/mc-gamertime/main/docker-compose.yml -o docker-compose.yml
echo "ADMIN_USERNAME=admin" >> .env
echo "ADMIN_PASSWORD=<your-password>" >> .env
docker compose up -d
```

`ADMIN_USERNAME`/`ADMIN_PASSWORD` are the **only required setting** when using local auth — they bootstrap your
first admin account on first boot (or configure `OIDC_*` with `DISABLE_LOCAL_AUTH=true` for SSO-only). Everything else — `BGG_TOKEN` for game search, `OIDC_*` for SSO, `RULEBOOKS_STORAGE_DIR` (mounted at `./config/rulebooks:/data/rulebooks` in `docker-compose.yml`), `SMTP_*` for
password-reset email, `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS`, etc. — is optional with a
working default; see [`.env.example`](./.env.example) or the [full config
reference](https://mcgamertime-docs.drmaggi.com/self-hosting/configuration/).

Open <http://localhost:4263> and log in.

For setup of remote access see [HTTPS / Reverse
Proxy](https://mcgamertime-docs.drmaggi.com/self-hosting/https/) and the
[security model](https://mcgamertime-docs.drmaggi.com/self-hosting/security/).

[Full self-hosting guide →](https://mcgamertime-docs.drmaggi.com/self-hosting/quickstart/)

### 2. Cloud-hosted on AWS

Host the app on AWS serverless infrastructure, provisioned by Terraform. Everything
is pay-per-request, which for regular personal use amounts to roughly **$0/month** — the free tier covers
it. Worth choosing if you want easy remote access and experience with cloud hosting while gaining the security benefits of AWS hosted infrastructure.

#### Prerequisites
An AWS account, plus Terraform, Node.js and Task installed — and **a domain name you own**.
The domain is not optional: CloudFront needs an ACM certificate, and ACM only issues one for
a domain you control.

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars
# then set: domain = "example.com"
```

`domain` in `infra/terraform.tfvars` is the **only required setting** - `terraform apply` refuses to run without it. Everything
else (`subdomain`, `bgg_token`, `alert_email`, `cloudfront_web_acl_arn`,
`extra_cors_origins`, `aws_region`) has a working default; see
[`infra/terraform.tfvars.example`](./infra/terraform.tfvars.example) or the [full AWS
guide](https://mcgamertime-docs.drmaggi.com/cloud-deploy/aws/) for what each does.

For full AWS installation instructions see: [Full AWS guide →](https://mcgamertime-docs.drmaggi.com/cloud-deploy/aws/).

The security considerations for the AWS hosted app are described here:
[Security & privacy on AWS →](https://mcgamertime-docs.drmaggi.com/cloud-deploy/security/).


## Stack

- **Frontend** — React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 7, TanStack Query 5,
  Zod 4, Recharts 3
- **Backend** — Python, FastAPI; uvicorn when self-hosted, Lambda + Mangum on AWS
- **Data** — embedded SQLite, or DynamoDB
- **Storage** — local filesystem (including a dedicated volume for PDF rulebooks), or S3; uploaded media is served by the app behind auth,
  never straight from the bucket
- **Infra** — Terraform, GitHub Actions, release-please

![Architecture: the same FastAPI app and React build served either from one self-hosted container backed by SQLite and the local filesystem, or on AWS behind CloudFront with API Gateway, Lambda, DynamoDB and S3](docs-site/src/assets/architecture.svg)

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
graph LR
  B["Browser"]
  B -->|"self-hosted"| C["one container<br/>FastAPI, serving the React build"]
  C --> SQ[("SQLite file")]
  C --> FS[("local filesystem")]
  B -->|"AWS"| CF["CloudFront"]
  CF --> S3[("S3<br/>static bundle")]
  CF --> AG["API Gateway"]
  AG --> L["Lambda<br/>the same FastAPI app"]
  L --> DDB[("DynamoDB")]
  L --> S3M[("S3<br/>uploaded media")]
```

</details>

[Screenshots and detail →](https://mcgamertime-docs.drmaggi.com/features/)

## Contributing

- [Contributing guide](./CONTRIBUTING.md)
- [Architecture walkthrough](https://mcgamertime-docs.drmaggi.com/contributing/architecture/) — how a request flows end to end
- [Recipes](https://mcgamertime-docs.drmaggi.com/contributing/recipes/) — add an endpoint, a page, a table
- [Security policy](./SECURITY.md) — report a vulnerability privately

## License

[MIT](./LICENSE)
