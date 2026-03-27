---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
workflowComplete: true
completedAt: '2026-03-20'
inputDocuments: []
workflowType: 'prd'
classification:
  projectType: 'web_app_saas'
  domain: 'fintech'
  complexity: 'medium'
  projectContext: 'greenfield'
briefCount: 0
researchCount: 0
brainstormingCount: 0
projectDocsCount: 0
---

# Product Requirements Document - mint_personal

**Author:** Neo
**Date:** 2026-03-20

## Executive Summary

mint_personal is a simplicity-first personal finance tracking web application that fills the void left by Mint.com's shutdown. Users upload bank and credit card statements (CSV), and the application automatically parses, categorizes, and visualizes monthly spending trends. An AI categorization engine learns individual spending patterns over time — improving accuracy with each user correction — delivering the core value of effortless clarity: *where did my money go?*

The primary user is an individual managing personal finances who wants spending visibility without budgeting tools, goal-setting pressure, or mandatory bank account linking. Built as a multi-tenant SaaS platform, mint_personal initially serves a single user with architecture designed to scale to a broader audience.

### What Makes This Special

Most personal finance tools fail in one of two ways: they require invasive bank OAuth connections (Copilot, Monarch Money, YNAB), or they overwhelm users with features that obscure the core insight. mint_personal is deliberately narrow — it does one thing brilliantly: ingest statements, learn spending patterns, and show where money went. No budgeting frameworks, no credit score monitoring, no bill reminders.

The AI-learned categorization mechanic makes the product measurably smarter with use. Each correction trains the user's personal model, shortening the review loop over time. This creates genuine retention through product improvement, not feature bloat.

Phase 2 introduces direct bank/institution API sync via Plaid and similar providers, extending the simplicity-first experience to automated data ingestion.

## Project Classification

- **Project Type:** Web Application (SPA) — Multi-tenant SaaS
- **Domain:** Fintech — Personal Finance Tracking
- **Complexity:** Medium (financial data handling, AI categorization, multi-tenant architecture; no payment processing, regulatory licensing, or KYC/AML requirements)
- **Project Context:** Greenfield

## Success Criteria

### User Success

- User uploads a statement and receives a fully categorized transaction list within 30 seconds
- AI categorization accuracy improves measurably over time — correction review pass shortens with each upload
- User views monthly spending by category and trends across multiple months without manual data entry beyond statement upload
- Experience is effortless and judgment-free — no alerts, nudges, or budgeting pressure

### Business Success

- mint_personal fully replaces Mint.com for the primary user's monthly financial review workflow
- Architecture supports onboarding additional users without rework
- Phase 2 Plaid integration adds without changes to the core data model or categorization engine

### Technical Success

- CSV parsing covers Chase, Amex, Bank of America, Capital One, and Wells Fargo export formats
- AI categorization engine reflects learned corrections in subsequent uploads
- Multi-tenant data isolation enforced at the database level
- Statement upload to categorized results: ≤ 30 seconds for statements up to 500 transactions
- AI categorization accuracy after 3 months of use: > 85% requiring no correction
- Zero cross-tenant data leakage incidents

## Product Scope

### MVP (Phase 1)

- User authentication (multi-tenant, secure)
- CSV statement upload — Chase, Amex, BoA, Capital One, Wells Fargo
- AI categorization with default taxonomy and correction feedback loop
- Uncategorized review queue for low-confidence transactions
- Monthly spending breakdown by category
- Multi-month trend visualization (line/bar charts)
- Transaction list with search and filter
- Admin user management panel

### Growth (Phase 2)

- PDF statement parsing
- Custom category creation and taxonomy management
- Spending insights and anomaly detection
- Data export (CSV)
- Multi-account dashboard view
- Plaid/bank API sync for automated ingestion
- Full mobile-responsive layout

### Vision (Phase 3)

- Open banking integrations beyond Plaid
- Shared household accounts
- Native mobile app (PWA or React Native)
- Year-over-year historical comparisons
- Optional opt-in budget targets

## User Journeys

### Journey 1: Neo — First Statement Upload (Primary User, Success Path)

**Setup:** Neo has three months of Chase and Amex statements in a Downloads folder with no tool to analyze them after Mint's shutdown.

**Opening Scene:** Neo signs into mint_personal for the first time. The dashboard is clean and empty. A single prominent call-to-action: *Upload a statement to get started.* No onboarding wizard. No tour.

**Rising Action:** Neo drags in a Chase CSV. A progress indicator shows parsing in real time — "Reading 147 transactions..." then "Categorizing..." Thirty seconds later a categorized transaction list appears. Amazon is under Shopping. Whole Foods under Groceries. Netflix under Entertainment.

**Climax:** Neo spots "Uber Eats" filed under Transportation instead of Dining. One click to reassign. The app responds: *"Got it — I'll remember that for next time."* The Amex statement goes up next. Uber Eats categorizes correctly, automatically.

**Resolution:** Two statements in, Neo sees the first monthly breakdown: Groceries $420, Dining $310, Subscriptions $87, Shopping $245. Clean bar chart. The question *"where did my money go?"* answered in under 5 minutes. The app is already smarter than it was an hour ago.

**Capabilities revealed:** Statement upload, CSV parser, AI categorization, correction feedback loop, monthly breakdown, trend charts.

---

### Journey 2: Neo — Messy Statement Edge Case (Primary User, Error Recovery)

**Setup:** Neo's Capital One statement exports with inconsistent date formatting and merchant names containing terminal IDs ("SQ *BLUE BOTTLE COFFEE #4821").

**Opening Scene:** Upload completes but flags 12 transactions as "Uncategorized — review needed," highlighted in amber.

**Rising Action:** Neo works through the review queue — fast, almost like swiping. "SQ *BLUE BOTTLE" → Dining. "AMZN MKTP US*AB3C" → Shopping. Each correction is one click. The app learns the Square prefix pattern and auto-resolves similar merchants in the same file.

**Climax:** One transaction has a zero-dollar amount — a refund entry distorting the monthly total. Neo finds it in the list and excludes it from calculations.

**Resolution:** Review queue clears. Monthly view is accurate. Neo trusts the app to handle messy real-world data — not by being perfect, but by surfacing uncertainty and making correction fast.

**Capabilities revealed:** Parsing error handling, uncategorized review queue, manual transaction exclusion, pattern learning within a single upload.

---

### Journey 3: Neo as Platform Admin — Onboarding a New User

**Setup:** A friend asks for access. Neo decides to open the platform to a small group.

**Opening Scene:** Neo logs into the admin panel. Creates a new user account, sets email and temporary password, assigns them to their own tenant. No data bleeds between accounts — isolation is enforced at the database level.

**Rising Action:** The new user logs in and uploads their first statement. Their AI model starts fresh — no influence from Neo's correction history. Their data lives in an isolated partition.

**Climax:** Neo checks the admin view: active users, last login timestamps, storage per tenant. No personal financial data visible — operational metrics only.

**Resolution:** The friend is self-sufficient within minutes. The SaaS architecture built "for later" pays off on day one of opening up.

**Capabilities revealed:** Admin user management, tenant creation, tenant isolation, admin operational dashboard (no PII exposure).

---

### Journey Requirements Summary

| Capability Area | Driven By |
|---|---|
| CSV statement parser (multi-bank) | Journey 1, 2 |
| AI categorization engine | Journey 1, 2 |
| User correction feedback loop | Journey 1, 2 |
| Uncategorized review queue | Journey 2 |
| Pattern learning within upload | Journey 2 |
| Manual transaction exclusion | Journey 2 |
| Monthly category breakdown | Journey 1 |
| Multi-month trend visualization | Journey 1 |
| User authentication (multi-tenant) | Journey 3 |
| Admin user management panel | Journey 3 |
| Tenant data isolation | Journey 3 |
| Admin operational dashboard | Journey 3 |

## Domain-Specific Requirements

### Compliance & Regulatory

- **GDPR / CCPA:** Financial transaction data is sensitive personal data. The data model must support account deletion and full data purge from day one; formal compliance obligations apply if the platform opens to EU or California users.
- **No PCI-DSS scope:** mint_personal handles only transaction records exported from cards, never raw card numbers. No card processing = no PCI-DSS obligation.
- **No KYC/AML requirements:** Not a financial institution, not processing funds. Purely a tracking and visualization tool.

### Security Constraints

- Transaction data encrypted at rest; HTTPS/TLS enforced for all traffic
- Tenant data isolation at the database layer (row-level security or schema-per-tenant)
- Raw statement files processed and discarded — never stored long-term
- User correction history logged for model retraining and audit purposes

### Integration Phases

- **Phase 1:** No external integrations. CSV parsing only.
- **Phase 2:** Plaid Link integration for read-only bank/card transaction access. mint_personal never handles banking credentials.

### Domain Risk Mitigations

| Risk | Mitigation |
|---|---|
| Cross-tenant data leak | DB-level row security + automated cross-tenant access tests in CI |
| Raw statement files expose sensitive data | Parse and discard; never store unprocessed uploads |
| AI miscategorization erodes trust | Uncertainty flagged visibly; correction is one click; model explains its guess |
| Scope creep into regulated territory | Explicitly out of scope: payments, lending, financial advice |

## Innovation & Novel Patterns

### Per-User Adaptive Categorization Engine

Unlike rule-based systems (Mint) or fully manual systems (YNAB), mint_personal introduces a correction-driven learning loop where each user trains their own categorization model. The system starts with general merchant intelligence and converges toward individual spending patterns through lightweight corrections. The review pass shrinks with use — creating a measurable, felt improvement that compounds over time.

### Competitive Landscape

| Tool | Categorization Approach | Per-User Learning? |
|---|---|---|
| Mint (defunct) | Static rule-based | No |
| YNAB | Manual by user | No |
| Copilot | AI + manual override | No (shared rules) |
| Monarch Money | AI + manual override | No (shared rules) |
| **mint_personal** | AI + correction feedback loop | **Yes** |

Most AI categorization in fintech improves a shared ruleset — corrections benefit all users. mint_personal corrections improve *your model only*, making the experience increasingly personal.

### Validation Approach

- **Metric:** Average corrections per statement upload, tracked monthly
- **Target:** Corrections per upload decrease month-over-month for the first 6 months
- **Fallback:** Uncategorized review queue ensures no transaction is silently miscategorized — user always has visibility and control

### Innovation Risk Mitigations

| Risk | Mitigation |
|---|---|
| AI requires too much data to learn | Strong merchant-name baseline rules ship day one; corrections refine, not replace |
| Repeated miscategorizations erode trust | Uncertainty surfaced visibly; one-click correction; model explains reasoning |
| Per-user model complexity exceeds solo dev capacity | Start with correction log + rule overlay; graduate to ML model as data accumulates |

## Web Application Requirements

### Architecture Overview

mint_personal is a browser-delivered SPA targeting modern desktop browsers. The application is authentication-gated — no public pages require SEO beyond a minimal landing/login page. The interaction model is upload-driven: users initiate actions rather than receiving real-time push data.

**Frontend:** SPA (React or Vue) with client-side routing, desktop-first responsive layout, drag-and-drop file upload with progress feedback, chart/visualization library for trend views.

**Backend:** REST API, async processing pipeline (upload → queue → process → notify), per-user AI model state stored server-side (correction log + learned rules), JWT or session-based auth with secure cookie handling.

**Infrastructure:** Cloud-hosted single region for MVP, object storage for temporary file handling (auto-deleted post-processing), relational database with row-level security, background job queue for async statement processing.

### Browser Support

| Browser | Support |
|---|---|
| Chrome, Firefox, Safari, Edge (latest 2 versions each) | Full |
| Internet Explorer | Not supported |
| Mobile browsers | Readable; not optimized in MVP |

### Responsive Design

- Desktop-first (1280px+ primary breakpoint)
- Tablet-readable (768px+) without horizontal scroll
- Mobile: functional but unoptimized in MVP; full mobile support in Phase 2

### Implementation Constraints

- Statement parser built as a modular plugin architecture — each bank/card format is a separate plugin; core logic unchanged when adding new formats
- AI categorization decoupled from the upload pipeline — swappable independently
- Tenant isolation enforced at ORM/query layer with integration tests asserting cross-tenant data is inaccessible

## Project Scoping

### MVP Strategy

**Approach:** Experience MVP — deliver a complete, polished core experience for a single user, proving the product is genuinely useful before opening to others.

**Constraint:** Solo developer (hobby project). Every architectural decision must optimize for one person maintaining the full stack. Prioritize proven technology over novelty.

**Cut order if time is limited:** PDF parsing → multi-bank CSV support → everything else. The correction feedback loop is non-negotiable — MVP without it is not the product.

### Risk Mitigation

**Technical Risks:**

| Risk | Likelihood | Mitigation |
|---|---|---|
| CSV parser fails on real-world bank formats | High | Modular parser architecture; start with 2–3 banks, expand iteratively |
| AI categorization too inaccurate to be useful | Medium | Rule-based baseline ships day one; ML is progressive enhancement |
| Per-user model complexity exceeds solo dev capacity | Medium | Correction log + rules overlay first; defer true ML until data exists |
| Multi-tenant isolation bug | Low / Critical | DB-level RLS + automated cross-tenant tests in CI from day one |

**Market Risks:** MVP is valuable to Neo regardless of external adoption — hobby project success is personal utility first. Per-user AI learning is a durable differentiator that existing tools don't offer.

## Functional Requirements

### User Authentication & Account Management

- FR1: Users can register for an account with email and password
- FR2: Users can log in and log out securely
- FR3: Users can reset their password via email
- FR4: Each user's data is isolated and inaccessible to other users
- FR5: Users can delete their account and all associated data

### Statement Upload & Parsing

- FR6: Users can upload a bank or credit card statement in CSV format
- FR7: Users can upload statements from 2 or more institutions in a single session
- FR8: The system parses uploaded statements and extracts transactions (date, merchant, amount)
- FR9: The system provides progress feedback during upload and parsing, updating status within 3 seconds of each stage transition
- FR10: The system flags transactions it cannot parse or categorize with ≥ 70% confidence and surfaces them for review
- FR11: The system detects and flags duplicate transactions from overlapping statement periods

### AI Categorization & Learning

- FR12: The system automatically assigns a category to each parsed transaction
- FR13: The system surfaces a confidence indicator for each categorization
- FR14: Users can view a queue of uncategorized or low-confidence transactions requiring review
- FR15: Users can correct a transaction's category with a single interaction
- FR16: The system applies learned corrections to similar merchants within the same upload
- FR17: The system applies learned corrections to future uploads from the same user
- FR18: Users can view the reason a transaction was assigned a given category

### Category Management

- FR19: The system provides a default category taxonomy (Groceries, Dining, Transport, Shopping, Subscriptions, Healthcare, Entertainment, Utilities)
- FR20: Users can manually assign any transaction to any available category
- FR21: Users can exclude specific transactions from monthly totals and trend calculations

### Spending Analysis & Visualization

- FR22: Users can view a monthly spending breakdown by category (total and percentage)
- FR23: Users can view spending trends across 2 or more months per category
- FR24: Users can view a full transaction list for any month, filterable by category
- FR25: Users can search transactions by merchant name or amount
- FR26: Users can navigate between months to compare spending

### Data Management

- FR27: Parsed transaction data is stored persistently per user
- FR28: Raw uploaded statement files are discarded after successful parsing
- FR29: Users can view all uploaded statements and their processing status
- FR30: User correction history is logged for audit and model retraining

### Admin — Platform Management

- FR31: Administrators can create new user accounts
- FR32: Administrators can view all users, their last login, and storage usage
- FR33: Administrators can deactivate or delete user accounts
- FR34: Administrators cannot access any user's personal financial transaction data
- FR35: Administrators can monitor system health and processing queue status

## Non-Functional Requirements

### Performance

- Authenticated dashboard page load: ≤ 2 seconds on broadband
- Statement upload acknowledgment (parsing started): ≤ 3 seconds from file drop
- Statement parsing and categorization end-to-end: ≤ 30 seconds for statements up to 500 transactions
- Monthly breakdown and trend chart render: ≤ 1 second from page navigation (client-side from cached data)
- Transaction list search: ≤ 500ms response time
- Non-processing API endpoints: ≤ 200ms p95 response time

### Security

- All data encrypted at rest (AES-256 or equivalent)
- All traffic encrypted in transit (TLS 1.2+)
- Authentication uses secure httpOnly session cookies or short-lived JWTs
- Passwords hashed with bcrypt or equivalent (minimum cost factor 12)
- Row-level security enforced at the database layer — not application-layer only
- Raw statement files permanently deleted within 1 hour of successful parsing
- Admin accounts blocked from user financial data at the API layer
- Automated cross-tenant data access tests pass in CI on every deployment
- No third-party analytics or tracking scripts receive financial data

### Scalability

- MVP targets 1–10 active users; architecture supports reaching 100 users without redesign
- Database schema supports 100k+ transactions per user without index redesign
- Statement processing is asynchronous — UI never blocks on processing jobs
- Background job queue is horizontally scalable to support 100 concurrent statement processing jobs without queue degradation

### Accessibility

- WCAG 2.1 AA compliance for all core flows: upload, review, categorization, visualization
- All interactive elements keyboard-navigable
- Color contrast ratios ≥ 4.5:1 for normal text
- Core flows screen reader compatible: transaction list, category breakdown, correction workflow
- No time-limited interactions that cannot be extended
