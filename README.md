# StayInformed.ca

**The easiest way for Canadians to track their MP's performance**

StayInformed.ca is a mobile-first web platform that provides Canadian citizens with transparent, accessible information about their federal Members of Parliament. One tap to find your MP using your location, with official government data presented in plain language, all from your phone.

## 🎯 Problem

Canadian citizens lack easy access to consolidated information about their MPs' performance. Government data is scattered across multiple websites, difficult to navigate on mobile devices, and presented without context or analysis.

## ✨ Solution

A comprehensive platform that:
- **Aggregates** data from multiple government sources into one place
- **Simplifies** complex political information into digestible metrics
- **Visualizes** trends and patterns through mobile-friendly charts
- **Contextualizes** data with comparisons to party/national averages
- **Alerts** users via weekly email digests
- **Scores** MPs on accountability using transparent algorithms
- **Locates** MPs instantly using browser geolocation

## 🚀 Features

### Core Features
- **One-Tap MP Discovery**: Use your phone's location to find your MP instantly
- **Comprehensive MP Profiles**: 4 tabs (Overview, Voting Record, Expenses, Analytics)
- **Accountability Scoring**: Transparent 0-100 scores based on 4 metrics
- **Weekly Email Digests**: Stay informed without constant checking
- **Mobile-First Design**: Optimized for 70% of users on smartphones

### Premium Features ($4.99/month)
- Historical data (past 3 parliaments)
- Detailed expense transaction breakdowns
- Advanced multi-MP comparisons
- CSV data exports
- Ad-free experience

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), Tremor, Tailwind CSS
- **Database**: Supabase (PostgreSQL 16+ with PostGIS)
- **Auth**: Supabase Auth
- **ORM**: Drizzle ORM
- **Hosting**: Vercel (frontend), Railway (scrapers)
- **Queue**: Graphile Worker (Postgres-native)
- **Email**: Resend
- **Payments**: Stripe
- **Monitoring**: Sentry

## 📊 Data Sources

All data scraped from official House of Commons sources:
- Voting Records: `ourcommons.ca/Members/en/Votes/XML`
- Bills: `parl.ca/LegisInfo`
- Expenses: `ourcommons.ca/ProactiveDisclosure`
- Petitions: `ourcommons.ca/Petitions`
- Committee Participation: `ourcommons.ca/Committees`

## 🏗️ Architecture Decisions

### Why Local PostGIS Instead of Represent API?
- No rate limits (Represent API: 60 requests/min)
- 100% uptime control
- Faster response (<100ms vs. 500ms+)
- No API keys to manage

### Why No Redis/Upstash?
- Next.js Native Data Cache is sufficient for MVP
- Postgres-native queues eliminate external dependency
- Reduces complexity and cost

### Why Hybrid Scraping (XML + Playwright)?
- XML is fast and low-memory (primary method)
- Playwright is reliable fallback if XML structure changes
- Reduces memory usage

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/stayinformed.ca.git

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Run database migrations
npm run db:migrate

# Start development server
npm run dev