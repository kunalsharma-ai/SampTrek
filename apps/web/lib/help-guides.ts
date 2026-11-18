/**
 * The Help page, menu by menu (feedback 2026-11-18): for every page in the menu, what it is for,
 * how to use it step by step, what each field means, and tips. Every guide has a screenshot with
 * numbered markers and an animated walkthrough (GIF) made from the running app by
 * scripts/help-shots.mjs, which reads `shot` below: the page to open, what to click first, and for
 * each step the thing on screen it points at (a Playwright selector). Pictures live in
 * public/help/guides/<id>.jpg and .gif, with the marker positions in public/help/guides/manifest.json.
 *
 * To change the words, edit the text here; to retake the pictures, run the script (see its header).
 */

export type GuideGroup = 'Start here' | 'Main menu' | 'Create and run a project' | 'Project page tabs' | 'Projects & fieldwork' | 'Finance' | 'Work' | 'Admin';
export const GUIDE_GROUPS: GuideGroup[] = ['Start here', 'Main menu', 'Create and run a project', 'Project page tabs', 'Projects & fieldwork', 'Finance', 'Work', 'Admin'];

export interface GuideStep {
  text: string;
  /** What the step points at on the screenshot (Playwright selector). Steps without one are text only. */
  target?: string;
}
export interface Guide {
  id: string;
  group: GuideGroup;
  title: string;
  /** The page in the app, for the "Open" link. */
  href?: string;
  /** What the page is for, in one or two sentences. */
  objective: string;
  steps: GuideStep[];
  /** Fields and buttons on the page, and what they do. */
  fields?: { name: string; text: string }[];
  tips?: string[];
  /** How the picture is taken: the page, then clicks (selectors) before the screenshot. */
  /** `full: false` keeps one 900 px screen; otherwise the picture is as tall as the page needs, up to 1500 px. */
  shot?: { path: string; clicks?: string[]; scroll?: string; full?: boolean };
}

/** Project page: opens the demo project and a tab. */
const tab = (name: string) => ({ path: '/projects/:demo', clicks: [`role=tab[name="${name}"]`], scroll: '[role="tablist"]' });

export const GUIDES: Guide[] = [
  // ───────────────────────────── Start here ─────────────────────────────
  {
    id: 'start', group: 'Start here', title: 'Find your way around', href: '/',
    objective: 'SampTrek runs research projects from setup to invoice: clients, vendors, projects with their links and security, live fieldwork, reports and money. The menu on the left opens every page; each main menu opens its own sub menu.',
    steps: [
      { text: 'The menu. Dashboard, Clients, Vendors, Projects and Reports are always shown. Click Projects & fieldwork, Finance, Work or Admin to open their pages underneath. The group of the page you are on stays open.', target: 'aside nav' },
      { text: 'Star any page to pin it under Favorites at the top of the menu.', target: 'aside nav >> text=Favorites' },
      { text: 'Search (Ctrl K) finds projects, clients, vendors and pages from anywhere.', target: 'header >> button[aria-label*="Search" i]' },
      { text: 'The + button starts a new project from any page.', target: 'header >> text=New project' },
      { text: 'Your name opens your account: security, Theme Studio, settings, the product tour and sign out.', target: 'header >> [aria-label="Account"]' },
      { text: 'Every (i) next to a title or field explains that item. This Help page explains every menu.' },
    ],
    tips: ['Collapse the menu with « Collapse at the bottom (or press [ ). In the narrow menu, click a main menu icon to see its pages.', 'Click any picture on this page to open it large; scroll or use + and − to zoom, and drag to move around.'],
    shot: { path: '/' },
  },
  {
    id: 'dashboard', group: 'Main menu', title: 'Dashboard', href: '/',
    objective: 'Your home screen: projects by status and the clicks, completes and revenue of today, yesterday, the last 7 days and this month.',
    steps: [
      { text: 'Status tiles: live, test, on hold and closed projects. Click one to open that list.', target: 'main >> text=All projects' },
      { text: 'Traffic for today, yesterday, 7 days and this month. Test traffic is never counted.', target: 'main >> text=This month' },
      { text: 'Show details opens charts, top clients and vendors, finance and the project board.', target: 'main >> text=Show details' },
      { text: 'Customise moves, resizes or hides panels just for you.', target: 'main >> text=Customise' },
    ],
    shot: { path: '/' },
  },
  // ───────────────────────────── Main menu ─────────────────────────────
  {
    id: 'clients', group: 'Main menu', title: 'Clients', href: '/clients',
    objective: 'The companies you run research for: contacts, billing details for invoices, and every project you did for them with completes, revenue and profit.',
    steps: [
      { text: 'Add client: name, short code (used in project codes and reports), website and at least one contact with an email.', target: 'main >> text=Add client' },
      { text: 'Bulk add: download the Excel template, fill one row per client, upload.', target: 'main >> text=Bulk add' },
      { text: 'Search by name, code, contact or email; filter by Active or Inactive.', target: 'main >> input[aria-label="Search clients"]' },
      { text: 'Active / Inactive switch. Only active clients can be picked for new projects.', target: 'main >> table >> [role="switch"] >> nth=0' },
      { text: 'The Projects number is a link: it opens every project of that client with project ID, month and year, work order, CPI, completes, approved completes, revenue, cost, profit and rejection ratio.', target: 'main >> table >> td:last-child >> nth=0' },
      { text: 'Edit opens the client with its logo, contacts and billing. The same project report shows below the form, 10, 25 or 100 at a time, with Download Excel with charts.', target: 'main >> text=Edit >> nth=0' },
    ],
    fields: [
      { name: 'Code', text: 'Short and unique, e.g. ACME. Used in project IDs, reports and invoice files.' },
      { name: 'Billing address and Tax ID', text: 'Printed under Bill to on the invoice PDF.' },
      { name: 'Approved completes', text: 'Completes the client accepted in reconciliation (project → Reconcile & invoice). Revenue and cost in the report count only these.' },
      { name: 'Rejection ratio', text: 'Rejected ÷ (approved + rejected) completes.' },
      { name: 'Excel with charts', text: 'A Summary sheet with totals per currency and pie, doughnut and column charts (revenue by project, approved vs rejected vs pending, revenue/cost/profit per project), and a Projects sheet with every row. Charts stay live in Excel.' },
    ],
    shot: { path: '/clients' },
  },
  {
    id: 'vendors', group: 'Main menu', title: 'Vendors', href: '/vendors',
    objective: 'Your sample suppliers (panels). Each vendor has its payout share, link variable, redirects, security and what it may see in its own login.',
    steps: [
      { text: 'Add vendor opens the vendor form (explained field by field below).', target: 'main >> text=Add vendor' },
      { text: 'Bulk add vendors from an Excel file.', target: 'main >> text=Bulk add' },
      { text: 'Score from the last 180 days: completes, acceptance after reconcile, speed and quality.', target: 'main >> table >> thead' },
      { text: 'Click a vendor to open its page: details, security for this vendor, projects and statistics.', target: 'main >> table >> tbody >> a >> nth=0' },
    ],
    fields: [
      { name: 'Payout share (% of client CPI)', text: 'What the vendor earns of the client CPI. Example: client CPI 10 USD × 60% = 6 USD payout per complete, 4 USD profit. It fills the payout whenever the vendor is added to a market; you can still type another payout there.' },
      { name: 'Auto assign to new projects', text: 'Adds this vendor to every market of each new project automatically, paid its payout share. Needs a payout share.' },
      { name: 'Hide CPI and payout in vendor login', text: 'The vendor still sees its projects, links and completes in its portal, but no prices or payout amounts.' },
      { name: 'Link variable', text: 'The name in the entry link where the vendor puts its respondent ID, e.g. vid in …/s/abc?vid=[UID]. Empty = vid.' },
      { name: "Vendor's respondent variable", text: "The placeholder the vendor's system fills, e.g. {TID}. With it, entry links come out ready to hand over: …/s/abc?vid={TID}." },
      { name: 'Redirects', text: 'Where respondents go back to after the survey (complete, terminate, quota full, security…). Every project gets these automatically.' },
      { name: 'Callback URL', text: 'Optional server-to-server notice when a respondent finishes.' },
      { name: 'Security for this vendor', text: 'ON / OFF switches that apply to this vendor in every project, e.g. duplicate detection off just for this vendor. An untouched switch follows each project; Reset puts it back.' },
    ],
    shot: { path: '/vendors' },
  },
  {
    id: 'vendor-page', group: 'Main menu', title: 'A vendor’s page and security switches', href: '/vendors',
    objective: 'Everything about one vendor: details, the security switches that apply to it in every project, and its projects.',
    steps: [
      { text: 'Edit the vendor: payout share, auto assign, hide payout in the vendor login, link variable and redirects.', target: 'main >> text=Edit >> nth=0' },
      { text: 'Security for this vendor: ON / OFF switches. A dimmed switch follows each project; flip it to set it for this vendor; Reset puts it back.', target: 'main >> text=Security for this vendor' },
      { text: 'Save security to apply. A project can still set its own value for the vendor (Vendors & links → Security).', target: 'main >> text=Save security' },
    ],
    shot: { path: '/vendors/:vendor', scroll: 'text=Security for this vendor' },
  },
  {
    id: 'projects', group: 'Main menu', title: 'Projects (manage projects)', href: '/projects',
    objective: 'Every project in one table, to find a project, see how it is doing and change many at once.',
    steps: [
      { text: 'Status tabs: All, Draft, Test, Live (green), Hold (orange), Closed (red), Invoiced. The number is how many projects have that status.', target: 'main >> [role="tablist"][aria-label="Project status"]' },
      { text: 'Search finds a project by its name, project ID (e.g. PRX10001) or work order number.', target: 'main >> input[placeholder^="Search name"]' },
      { text: 'All categories: show only B2B, B2C, Healthcare and other categories (your own categories too).', target: 'main >> select[aria-label="Category"]' },
      { text: 'Compact / Comfortable: smaller rows to see more projects at once.', target: 'main >> text=Comfortable' },
      { text: 'Columns (the field chooser): tick the columns to show, e.g. work order, sales person, speeders, live links. Drag a column edge to resize. Your choice is remembered.', target: 'main >> button:has-text("Columns")' },
      { text: 'Templates: saved project setups (markets, security, redirects, gate questions) to start new projects from.', target: 'main >> text=Templates' },
      { text: 'CSV downloads the list as it is filtered.', target: 'main >> button:has-text("CSV")' },
      { text: 'Tick live projects to put them on hold together, or held ones to set them live.', target: 'main >> table >> tbody >> input[type="checkbox"] >> nth=0' },
    ],
    tips: ['Click a column title to sort; click again to reverse.', 'Draft and Test projects cannot be ticked for bulk status changes.'],
    shot: { path: '/projects' },
  },
  {
    id: 'reports', group: 'Main menu', title: 'Reports', href: '/reports',
    objective: 'Clicks, completes, conversion, revenue, cost and profit across projects, by client, vendor, country or day, so anyone can answer “how are we doing?”.',
    steps: [
      { text: 'Pick the dates, clients, vendors, countries, project managers or status to report on.', target: 'main >> text=Date range' },
      { text: 'Group by client, vendor, country, project or day.', target: 'main >> [role="tab"] >> nth=0' },
      { text: 'Money in each currency, or converted into one currency at the rate you choose.', target: 'main >> text=Currency' },
      { text: 'Save the filters as a view to reuse, and share it with the team.', target: 'main >> text=Save view' },
      { text: 'Download Excel, CSV or PDF of exactly what you see, or schedule it by email.', target: 'main >> text=Scheduled reports' },
    ],
    fields: [
      { name: 'Conversion', text: 'Completes ÷ clicks (entries).' },
      { name: 'Revenue / cost / profit', text: 'Client CPI × completes, vendor payout × completes, and the difference. Test traffic is never counted.' },
      { name: 'Scheduled reports', text: 'Reports → Schedules sends a saved view by email daily, weekly or monthly.' },
    ],
    shot: { path: '/reports' },
  },
  // ───────────────────────────── Create and run a project ─────────────────────────────
  {
    id: 'create', group: 'Create and run a project', title: 'Create project, phase by phase', href: '/projects/new',
    objective: 'Set up a whole project in one form: client and basics, markets, vendors, gate questions, redirects, devices and security. It starts in Test, so nothing goes live until you say so.',
    steps: [
      { text: 'Start: a blank project, a saved template, a won bid from SampBidx, or a client brief the AI reads for you.', target: 'main >> text=Start from' },
      { text: 'Project information: name, client and contact, category, project manager, sales person and work order. Client, category and PM can be changed later.', target: 'main >> text=Project information' },
      { text: 'Basics: LOI, IR, completes and CPI, typed once for all markets.', target: 'main >> text=Basics: LOI, IR, completes and CPI' },
      { text: 'Target markets: add countries with language and target group. Each market can differ from the basics (CPI, completes, LOI). Upload many markets from the Excel template.', target: 'main >> text=Target markets' },
      { text: 'Survey links: the live and test client survey links for each market. The link must contain {uid} where the client expects the respondent ID.', target: 'main >> text=Live survey link >> nth=0' },
      { text: 'Vendors: who sends respondents to each market, with their payout. Vendors set to auto assign are added for you.', target: 'main >> text=Vendors >> nth=0' },
      { text: 'Gate survey questions: screening questions before the client survey. The category may fill them from the Survey library.', target: 'main >> text=Gate survey questions' },
      { text: 'Survey redirects, devices (desktop, phone, tablet and their systems) and security switches.', target: 'main >> text=Security and respondent quality' },
      { text: 'Create project saves it in Test. Open it, check with test links, then set it Live.', target: 'main >> button:has-text("Create project")' },
    ],
    fields: [
      { name: 'Target group', text: 'Who the market is for, e.g. Economic or Surgeon. The same country can be added twice with different target groups.' },
      { name: 'Apply to all', text: 'Copies a value to every market at once.' },
      { name: '{uid}', text: 'SampTrek puts the respondent ID (UID) in the client survey link here; the client sends it back on the redirect. Links without it are refused.' },
    ],
    tips: ['The form keeps a draft as you type; you can leave and come back.', 'Save a finished project as a template (project page → Save as template) to start the next one faster.'],
    shot: { path: '/projects/new', full: true },
  },
  {
    id: 'project', group: 'Create and run a project', title: 'Project page and fieldwork status', href: '/projects',
    objective: 'One project and its fieldwork: live status, money and every part of the setup in tabs.',
    steps: [
      { text: 'Status: Draft, Test, Live, On hold, Closed. Test traffic is never billed. Going live checks each market has a survey link and a vendor.', target: 'main >> button:has-text("Live") >> nth=0' },
      { text: 'Clone project, Save as template, Client dashboard (a live read-only page for the client) and Redirects (the links the client survey returns to).', target: 'main >> text=Clone project' },
      { text: 'View & download data: every respondent of the project with search, outcome filter, field chooser and CSV download.', target: 'main >> text=View & download data' },
      { text: 'Fieldwork status cards. Click Completes, In progress, Terminates, Overquota, Speeders or Quality to see the respondents behind the number, and download them.', target: 'main >> [aria-label="Fieldwork status"]' },
      { text: 'Money: client CPI, expected revenue, live revenue, cost and profit per currency.', target: 'main >> [aria-label="Money"]' },
      { text: 'Tabs. They wrap onto a second row on a narrow screen, so every tab stays in view. Each tab is explained below.', target: 'main >> [role="tablist"].tabs-wrap' },
    ],
    shot: { path: '/projects/:demo' },
  },
  // ───────────────────────────── Project page tabs ─────────────────────────────
  {
    id: 'tab-overview', group: 'Project page tabs', title: 'Overview tab', href: '/projects',
    objective: 'The markets of the project: country, language, target group, LOI, IR, CPI, completes and the client survey links, each with its own status.',
    steps: [
      { text: 'Each market row: status (set one market live, pause it or close it), completes against target, CPI and survey links.', target: 'css=[role="tablist"] ~ * >> table >> tbody >> tr >> nth=0' },
      { text: 'Edit a market to change its LOI, IR, CPI, target, survey links or session time.', target: 'css=[role="tablist"] ~ * >> button[aria-label^="Edit"] >> nth=0' },
      { text: 'Add a market, or the same country again for another target group.', target: 'css=[role="tablist"] ~ * >> text=Add market' },
    ],
    shot: tab('Overview'),
  },
  {
    id: 'tab-client-links', group: 'Project page tabs', title: 'Client unique links', href: '/projects',
    objective: 'When the client gives one survey link per respondent instead of one link for everybody. Each respondent who enters gets the next unused client link.',
    steps: [
      { text: 'Turn on client unique links for a market.', target: 'css=[role="tablist"] ~ * >> [role="switch"] >> nth=0' },
      { text: 'Paste or upload the client’s links (one per line, or Excel/CSV). Each must contain {uid}.', target: 'css=[role="tablist"] ~ * >> textarea >> nth=0' },
      { text: 'See how many are unused, assigned and left; download them with who used each one.', target: 'css=[role="tablist"] ~ * >> text=Export CSV' },
    ],
    tips: ['Test links borrow a client link without using it up.', 'When no unused link is left, new respondents end with a technical error; upload more in time.'],
    shot: tab('Client unique links'),
  },
  {
    id: 'tab-vendors', group: 'Project page tabs', title: 'Vendors & links', href: '/projects',
    objective: 'Who sends respondents to each market, what they are paid and the entry links you hand them.',
    steps: [
      { text: 'By vendor (default) or By market. Add vendors in By market.', target: 'css=[role="tablist"] ~ * >> [role="radiogroup"][aria-label="Group vendors"]' },
      { text: 'Copy all links (live and test, as rows that paste into Excel) or Copy only live links.', target: 'css=[role="tablist"] ~ * >> text=Copy only live links >> nth=0' },
      { text: 'One status for the vendor in this project: Active, On hold, Inactive, or Remove from project when it was added by mistake (only before it sent real respondents).', target: 'css=[role="tablist"] ~ * >> select[aria-label^="Status of"] >> nth=0' },
      { text: 'View report: that vendor’s respondents with UID, respondent ID, market, IP ID, LOI, status, gate answers and times; 10, 25 or 100 a page; download.', target: 'css=[role="tablist"] ~ * >> text=View report >> nth=0' },
      { text: 'Security: ON / OFF switches for this vendor in this project only.', target: 'css=[role="tablist"] ~ * >> button:has-text("Security") >> nth=0' },
      { text: 'Apply to all markets: one payout for this vendor everywhere.', target: 'css=[role="tablist"] ~ * >> text=Apply to all markets >> nth=0' },
      { text: 'Live link and Test link for each market. Replace [UID] with the vendor’s respondent ID macro.', target: 'css=[role="tablist"] ~ * >> text=Live link >> nth=0' },
    ],
    fields: [
      { name: 'Payout', text: 'What the vendor earns per complete in that market. Red when it is above the client CPI.' },
      { name: 'Link variable', text: 'The query name that carries the vendor’s respondent ID (vid, uid, rid…).' },
      { name: 'Test link', text: 'Ends in &test=1, never billed, runs every security check but never blocks. Opened as copied, it makes a TEST- ID for you.' },
    ],
    shot: tab('Vendors & links'),
  },
  {
    id: 'tab-vendor-unique', group: 'Project page tabs', title: 'Vendor unique links', href: '/projects',
    objective: 'One-time links, one per respondent, for vendors who need them. A link works once: anyone opening it again is sent to the Duplicate page.',
    steps: [
      { text: 'Pick the vendor and market, and how many links (up to 50,000 at a time).', target: 'css=[role="tablist"] ~ * >> text=Vendor and market >> nth=0' },
      { text: 'Prefix (optional): put a word in front of every link, e.g. pretest → …/u/pretest-sU2bEi7q…, or 78- → …/u/78-sU2bEi7q…. Use a new prefix for each wave.', target: 'css=[role="tablist"] ~ * >> text=Prefix (optional)' },
      { text: 'Batch name and an optional expiry date, then Generate.', target: 'css=[role="tablist"] ~ * >> button:has-text("Generate")' },
      { text: 'Download by prefix: every link of one prefix as CSV, e.g. 100 pretest links and 200 links of the next prefix separately.', target: 'css=[role="tablist"] ~ * >> text=Download by prefix:' },
      { text: 'Unique links only: close the shared live link so only unique links work. The test link keeps working.', target: 'css=[role="tablist"] ~ * >> text=Unique links only >> nth=0' },
      { text: 'The Links list: filter by vendor, batch, prefix or status, find a key, revoke unused links, and download what you filtered.', target: 'css=[role="tablist"] ~ * >> text=Find a key' },
    ],
    shot: tab('Vendor unique links'),
  },
  {
    id: 'tab-quotas', group: 'Project page tabs', title: 'Quotas & monitor', href: '/projects',
    objective: 'Quota cells (e.g. age or region targets) and the field dates, autopilot rules and alerts that watch the project for you.',
    steps: [
      { text: 'Add quota cells per market from gate answers or device; a full cell sends new respondents back as quota full.', target: 'css=[role="tablist"] ~ * >> #quotas' },
      { text: 'Field dates, auto-pause and alerts: e.g. pause a vendor at its target, or alert when IR drops.', target: 'css=[role="tablist"] ~ * >> #monitor' },
    ],
    shot: tab('Quotas & monitor'),
  },
  {
    id: 'tab-sampaudience', group: 'Project page tabs', title: 'SampAudience', href: '/projects',
    objective: 'Sends this project to SampAudience (Sampledge’s own panel) so its members can take the survey, with the project’s targeting.',
    steps: [{ text: 'Connect the project and choose the markets and targeting to send. Needs SampAudience set up in Settings → Integrations.', target: 'css=[role="tablist"] ~ * >> text=SampAudience >> nth=0' }],
    shot: tab('SampAudience'),
  },
  {
    id: 'tab-security', group: 'Project page tabs', title: 'Gate & security', href: '/projects',
    objective: 'The checks every respondent passes before the client survey: gate questions, human check, duplicates, location, bots and links.',
    steps: [
      { text: 'Turn every check off, or on, with one click.', target: 'css=[role="tablist"] ~ * >> text=Turn every check off' },
      { text: 'Gate survey and prescreener: your own questions before the client survey.', target: 'css=[role="tablist"] ~ * >> text=Gate survey >> nth=0' },
      { text: 'Duplicates: duplicate detection, fingerprinting, cookies, across projects, and One open survey per IP (stops extra tabs; switch it off to test again and again from one office).', target: 'css=[role="tablist"] ~ * >> text=One open survey per IP' },
      { text: 'Devices allowed: desktop, phone and tablet, and their systems.', target: 'css=[role="tablist"] ~ * >> text=Devices allowed' },
      { text: 'Save security. Live links block; test links run every check but only log it.', target: 'css=[role="tablist"] ~ * >> button:has-text("Save") >> nth=0' },
    ],
    tips: ['“You’ve already taken part” means the same respondent ID came in again (never allowed), or another session from the same IP is still open (One open survey per IP), or a duplicate check matched. Use a test link or a new ID to try again.'],
    shot: tab('Gate & security'),
  },
  {
    id: 'tab-pages', group: 'Project page tabs', title: 'Respondent pages', href: '/projects',
    objective: 'The pages respondents see at the end (complete, terminate, quota full, security…) and on the gate: your logo, colours, pictures and words.',
    steps: [{ text: 'Pick a page, change its title, message, colours and picture, and preview it on a phone or desktop.', target: 'css=[role="tablist"] ~ * >> text=Preview >> nth=0' }],
    shot: tab('Respondent pages'),
  },
  {
    id: 'tab-redirects', group: 'Project page tabs', title: 'Redirects', href: '/projects',
    objective: 'Where the client survey sends respondents back to (one link per status) and where SampTrek then sends them: the vendor, or your end page.',
    steps: [
      { text: 'The links to give the client: complete, terminate, quota full and security, with {uid} filled in by the client.', target: 'css=[role="tablist"] ~ * >> text=Copy >> nth=0' },
      { text: 'Rules per vendor or market, with versions you can schedule and roll back.', target: 'css=[role="tablist"] ~ * >> text=Version >> nth=0' },
    ],
    shot: tab('Redirects'),
  },
  {
    id: 'tab-qa', group: 'Project page tabs', title: 'QA studio', href: '/projects',
    objective: 'Walk through the respondent flow as a tester: gate, client survey link and each redirect, without counting as traffic.',
    steps: [{ text: 'Pick a market and vendor, start a test, and follow each step; the result shows what a respondent would see.', target: 'css=[role="tablist"] ~ * >> button >> nth=0' }],
    shot: tab('QA studio'),
  },
  {
    id: 'tab-respondents', group: 'Project page tabs', title: 'Respondents', href: '/projects',
    objective: 'The latest respondent sessions with vendor, market, status, why they ended and approval.',
    steps: [
      { text: 'Include test sessions to see your own tests.', target: 'css=[role="tablist"] ~ * >> text=Include test sessions' },
      { text: 'Tick completes and Approve or Reject them by hand (or use Reconcile & invoice for a client list).', target: 'css=[role="tablist"] ~ * >> table >> thead' },
    ],
    shot: tab('Respondents'),
  },
  {
    id: 'tab-answers', group: 'Project page tabs', title: 'Answers', href: '/projects',
    objective: 'Gate and prescreener answers of every respondent, with download.',
    steps: [{ text: 'Filter by market, vendor or outcome and download the answers.', target: 'css=[role="tablist"] ~ * >> text=Export CSV' }],
    shot: tab('Answers'),
  },
  {
    id: 'tab-finance', group: 'Project page tabs', title: 'Reconcile & invoice (how an invoice is raised)', href: '/projects',
    objective: 'Turn completes into money: reconcile with the client’s list of valid IDs, then raise the invoice and vendor bills.',
    steps: [
      { text: 'Reconcile: paste or upload the client’s final list of valid IDs. Listed completes are approved, the others rejected (or approve/reject only the listed ones).', target: 'css=[role="tablist"] ~ * >> text=Reconcile >> nth=0' },
      { text: 'Create invoice: one draft invoice per currency from the approved completes not billed yet.', target: 'css=[role="tablist"] ~ * >> button:has-text("Create draft invoice")' },
      { text: 'Open the draft: pick a template, add tax and extra fields such as a PO number, then Mark as sent. Download the PDF with your signature and stamp.', target: 'css=[role="tablist"] ~ * >> text=Invoices >> nth=0' },
      { text: 'Vendor bills: what you owe each vendor for its approved completes.', target: 'css=[role="tablist"] ~ * >> text=/vendor bill/i >> nth=0' },
    ],
    shot: tab('Reconcile & invoice'),
  },
  {
    id: 'tab-files', group: 'Project page tabs', title: 'Files & requests', href: '/projects',
    objective: 'Files of the project (questionnaire, quotas, reports) and requests with the client or vendors.',
    steps: [{ text: 'Upload a file and choose who may see it: the team, the client portal or a vendor.', target: 'css=[role="tablist"] ~ * >> text=Upload >> nth=0' }],
    shot: tab('Files & requests'),
  },
  {
    id: 'tab-team', group: 'Project page tabs', title: 'Team', href: '/projects',
    objective: 'Comments with @mentions, handovers between project managers and the activity feed of the project.',
    steps: [{ text: 'Write a comment, @mention a colleague (they get a notice), or hand the project over with notes.', target: 'css=[role="tablist"] ~ * >> textarea >> nth=0' }],
    shot: tab('Team'),
  },
  {
    id: 'tab-history', group: 'Project page tabs', title: 'History', href: '/projects',
    objective: 'Every saved version of the project’s settings: who changed what and when, and restore of an earlier version.',
    steps: [{ text: 'Open a version to see the changes; Restore puts the settings back (status, vendors, quotas and redirects stay).', target: 'css=[role="tablist"] ~ * >> button:has-text("Restore") >> nth=0' }],
    shot: tab('History'),
  },
  // ───────────────────────────── Projects & fieldwork ─────────────────────────────
  {
    id: 'board', group: 'Projects & fieldwork', title: 'Project board', href: '/projects/board',
    objective: 'Every project as a card by stage (Draft, Test, Live, Hold, Closed), and on a timeline by field dates.',
    steps: [
      { text: 'Drag a card to another stage to change its status.', target: 'main >> text=Live >> nth=0' },
      { text: 'Switch to the timeline to see field dates side by side.', target: 'main >> text=Timeline' },
    ],
    shot: { path: '/projects/board' },
  },
  {
    id: 'won-bids', group: 'Projects & fieldwork', title: 'Won bids', href: '/won-bids',
    objective: 'Bids won in SampBidx arrive here by themselves, ready to become projects.',
    steps: [{ text: 'Set up project opens Create project already filled from the bid (markets, sample, LOI, IR, CPI).', target: 'main >> text=Set up project >> nth=0' }],
    shot: { path: '/won-bids' },
  },
  {
    id: 'monitor', group: 'Projects & fieldwork', title: 'Fieldwork monitor', href: '/monitor',
    objective: 'Alerts across all live projects: slow pace, stalled markets, low incidence, quality problems and autopilot actions.',
    steps: [
      { text: 'Each alert says what is wrong and in which project, market or vendor.', target: 'main >> table >> nth=0' },
      { text: 'Open the project to act, or acknowledge the alert.', target: 'main >> a >> nth=0' },
    ],
    shot: { path: '/monitor' },
  },
  {
    id: 'redirect-health', group: 'Projects & fieldwork', title: 'Redirect health', href: '/redirect-health',
    objective: 'Whether respondents reach the right place: broken redirects, slow ones, fallbacks used and failed callbacks.',
    steps: [{ text: 'Look at errors and fallbacks by project and vendor, then open the project’s Redirects tab to fix them.', target: 'main >> h1' }],
    shot: { path: '/redirect-health' },
  },
  {
    id: 'data-processing', group: 'Projects & fieldwork', title: 'Data processing', href: '/data-processing',
    objective: 'Clean the data before delivery: speeders, straight-liners, duplicates and quota balance, then export clean data.',
    steps: [{ text: 'Pick a project, run the checks, review the flagged respondents and export.', target: 'main >> select >> nth=0' }],
    shot: { path: '/data-processing' },
  },
  {
    id: 'analytics', group: 'Projects & fieldwork', title: 'Analytics', href: '/analytics',
    objective: 'Cross tabs and charts of the answers, for quick insights and deliverables.',
    steps: [{ text: 'Pick a project and questions, choose rows and columns, and download the table or chart.', target: 'main >> select >> nth=0' }],
    shot: { path: '/analytics' },
  },
  // ───────────────────────────── Finance ─────────────────────────────
  {
    id: 'invoices', group: 'Finance', title: 'Invoices', href: '/invoices',
    objective: 'Every invoice to clients: draft, sent, paid, overdue and void. An invoice is raised from a project’s Reconcile & invoice tab from its approved completes.',
    steps: [
      { text: 'Filter by status, client or project.', target: 'main >> text=Draft >> nth=0' },
      { text: 'Open an invoice to add tax and extra fields (PO number…), choose its template, mark it sent or paid, and download the PDF.', target: 'main >> table >> tbody >> a >> nth=0' },
    ],
    fields: [
      { name: 'Templates', text: 'Six designs: Classic, Modern, Minimal, Bold, Corporate and Elegant. Settings → Invoice design picks the usual one; each draft can pick another.' },
      { name: 'Customise a template', text: 'Settings → Invoice design: accent colour, rename fields (INVOICE → TAX INVOICE, Bill to → Customer), hide fields (market, work order, due date…), your own fields on every invoice (PAN, CIN, LUT, HSN/SAC).' },
      { name: 'Signature and stamp', text: 'Upload a signature and a company stamp (PNG or JPEG under 300 KB) with the signatory’s name and title. They print at the foot of every invoice.' },
      { name: 'Extra fields on one invoice', text: 'On a draft invoice: label and value, e.g. PO number 4500012.' },
    ],
    shot: { path: '/invoices' },
  },
  {
    id: 'invoice-design', group: 'Finance', title: 'Invoice design: templates, fields, signature and stamp', href: '/settings#invoice-design',
    objective: 'How your invoice PDFs look: the template, colour, field names, extra fields and the signature and stamp.',
    steps: [
      { text: 'Pick one of six templates. The small pictures show the layout.', target: 'main >> [aria-label="Invoice template"]' },
      { text: 'Accent colour, or the template’s own.', target: 'main >> text=Accent colour' },
      { text: 'Rename or hide fields on the template.', target: 'main >> text=Fields on the template' },
      { text: 'Your own fields, printed on every invoice.', target: 'main >> text=Your own fields' },
      { text: 'Signature and company stamp, with the signatory’s name and title.', target: 'main >> text=Company stamp or seal' },
      { text: 'Preview opens a sample invoice in the design before you save.', target: 'main >> text=Preview sample PDF' },
    ],
    shot: { path: '/settings', scroll: '#invoice-design' },
  },
  {
    id: 'payables', group: 'Finance', title: 'Vendor payables', href: '/payables',
    objective: 'What you owe vendors: bills made from their approved completes, approved and paid.',
    steps: [{ text: 'Open a bill to record the vendor’s invoice number, approve it and mark it paid.', target: 'main >> table >> nth=0' }],
    shot: { path: '/payables' },
  },
  {
    id: 'accounting', group: 'Finance', title: 'Accounting exports', href: '/accounting',
    objective: 'Invoices, bills and payments in the format of your accounting software (Zoho Books, Tally, QuickBooks, Xero) or synced directly.',
    steps: [{ text: 'Choose the period and format, download, or sync to Zoho Books when it is connected.', target: 'main >> button >> nth=0' }],
    shot: { path: '/accounting' },
  },
  // ───────────────────────────── Work ─────────────────────────────
  {
    id: 'tasks', group: 'Work', title: 'Tasks', href: '/tasks',
    objective: 'To-dos for you and your team, with due dates and reminders, linked to projects.',
    steps: [{ text: 'Add a task, assign it, set a due date; overdue ones show in red and in your bell.', target: 'main >> text=New task' }],
    shot: { path: '/tasks' },
  },
  {
    id: 'chat', group: 'Work', title: 'Team chat', href: '/chat',
    objective: 'Messages inside SampTrek: direct messages, groups and a room per project.',
    steps: [{ text: 'Pick a conversation or start one; @mention people; files and project links work in messages.', target: 'main >> input >> nth=0' }],
    shot: { path: '/chat' },
  },
  {
    id: 'requests', group: 'Work', title: 'Requests', href: '/requests',
    objective: 'Questions, issues and disputes from clients and vendors through their portals, and your answers.',
    steps: [{ text: 'Open a request, reply (the client or vendor is emailed) and close it when done.', target: 'main >> text=New request' }],
    shot: { path: '/requests' },
  },
  {
    id: 'copilot', group: 'Work', title: 'AI copilot', href: '/copilot',
    objective: 'Ask in plain words: “which vendors are slow in PRX10001?”, “summarise this week”, or speak by voice.',
    steps: [{ text: 'Type a question; it answers from your data. Set up AI providers in Settings → Integrations.', target: 'main >> text=Conversations' }],
    shot: { path: '/copilot' },
  },
  // ───────────────────────────── Admin ─────────────────────────────
  {
    id: 'portal-access', group: 'Admin', title: 'Portal access', href: '/portal-access',
    objective: 'Logins for clients and vendors to their own portals: clients see their projects and progress; vendors see their links, respondents and payouts (unless hidden).',
    steps: [{ text: 'Invite a client or vendor contact; they get an email to set a password. Deactivate a login any time.', target: 'main >> button >> nth=0' }],
    shot: { path: '/portal-access' },
  },
  {
    id: 'integrations', group: 'Admin', title: 'Integrations', href: '/settings/integrations',
    objective: 'Connect email (Zoho Mail), sign-in (Google, Microsoft, Zoho), AI providers, accounting, SampBidx, SampAudience, payments and backups. Every key is entered here and stored encrypted in the database, never in files.',
    steps: [{ text: 'Open a card, enter the keys, Test, then Save. A green tick shows it works.', target: 'main >> h2 >> nth=1' }],
    shot: { path: '/settings/integrations' },
  },
  {
    id: 'team', group: 'Admin', title: 'Team', href: '/settings/team',
    objective: 'Your staff logins and their roles: Admin, Project manager, Sales, Finance, Viewer.',
    steps: [{ text: 'Invite a person with a role; change the role, reset a password or deactivate them.', target: 'main >> button >> nth=0' }],
    shot: { path: '/settings/team' },
  },
  {
    id: 'features', group: 'Admin', title: 'Features & access', href: '/settings/features',
    objective: 'Which features each role or person may use, within your plan.',
    steps: [{ text: 'Switch a feature off for a role or one person; their menu updates within seconds.', target: 'main >> text=Everyone >> nth=0' }],
    shot: { path: '/settings/features' },
  },
  {
    id: 'privacy', group: 'Admin', title: 'Privacy', href: '/settings/privacy',
    objective: 'How long respondent data is kept, consent notices per country, and erasing a person’s data.',
    steps: [{ text: 'Set retention, add consent text per market, and handle erase requests.', target: 'main >> h2 >> nth=0' }],
    shot: { path: '/settings/privacy' },
  },
  {
    id: 'subscription', group: 'Admin', title: 'Subscription', href: '/settings/subscription',
    objective: 'Your plan, its limits and usage, and paying or renewing online.',
    steps: [{ text: 'Check usage against the limits; upgrade or renew and download receipts.', target: 'main >> text=Subscription >> nth=0' }],
    shot: { path: '/settings/subscription' },
  },
  {
    id: 'branding', group: 'Admin', title: 'Branding', href: '/settings/branding',
    objective: 'Your own name, logo, colours, login page and email sender, so SampTrek looks like your company.',
    steps: [{ text: 'Upload logos, pick colours, preview the login page and portals, then save.', target: 'main >> h2 >> nth=0' }],
    shot: { path: '/settings/branding' },
  },
  {
    id: 'surveys', group: 'Admin', title: 'Survey (library and audience sets)', href: '/settings/surveys',
    objective: 'Ready gate surveys (consumer, tobacco, B2B decision makers, healthcare…) that new projects in a category start with.',
    steps: [
      { text: 'Pick a set, Add question (or from the Library), set which answers qualify or screen out, Save.', target: 'main >> text=Add question >> nth=0' },
      { text: 'Tick the project categories that start with this set.', target: 'main >> text=B2B >> nth=0' },
    ],
    shot: { path: '/settings/surveys' },
  },
  {
    id: 'settings', group: 'Admin', title: 'Settings', href: '/settings',
    objective: 'Organisation settings: numbering and UID prefix, alerts, finance and invoice details, invoice design, redirect domains, dropdown options, sign-in security and single sign-on.',
    steps: [
      { text: 'Invoice details: seller name, address, tax ID and bank details on every invoice.', target: 'main >> text=Invoice details' },
      { text: 'Invoice design: template, colour, fields, signature and stamp.', target: 'main >> text=Invoice design' },
    ],
    shot: { path: '/settings', scroll: 'main >> text=Invoice details' },
  },
  {
    id: 'theme', group: 'Admin', title: 'Theme Studio', href: '/settings/appearance',
    objective: 'How SampTrek looks for you: light, dark or neon theme, colours, density and motion.',
    steps: [{ text: 'Pick a theme and accent; changes apply at once and only for you.', target: 'main >> h2 >> nth=0' }],
    shot: { path: '/settings/appearance' },
  },
];

export const FAQ: { q: string; a: string }[] = [
  { q: 'What are UID and VID?', a: 'UID is the respondent ID shared between you and the client: SampTrek puts it in the client survey link where {uid} is, and the client sends it back on the redirect. VID is the vendor’s own respondent ID: it comes in on the vendor entry link (for example ?vid=…) and goes back to the vendor on their redirect.' },
  { q: 'I turned every security check off and still see “You’ve already taken part”. Why?', a: 'Three things can still send you there. 1) The same respondent ID entered this vendor link before: one ID can enter only once, always (otherwise a complete could be paid twice). Use a new ID, or the test link, which makes a fresh TEST- ID each time. 2) One open survey per IP: while your first session from this IP is still open (you closed the client survey without finishing), a second one is turned away. Switch “One open survey per IP” off on Gate & security (or per vendor) to test again from the same office. 3) A unique link (/u/…) works only once.' },
  { q: 'Why will my survey link not save?', a: 'A live client survey link must contain {uid}, for example https://survey.example.com/s/123?rid={uid}. Without it the client cannot send the respondent back.' },
  { q: 'How do I raise an invoice?', a: 'Project → Reconcile & invoice: reconcile with the client’s list (or approve completes by hand), then Create invoice. Open the draft from Finance → Invoices, add tax and fields, Mark as sent, and download the PDF.' },
  { q: 'How do I remove a vendor I added by mistake?', a: 'Vendors & links → the vendor’s card → status drop-down → Remove from project. This works while the vendor has no real respondents; after that choose Inactive (its links stop working, its data stays).' },
  { q: 'Why does the report show an IP ID instead of the IP?', a: 'SampTrek never stores raw IP addresses (privacy). The report shows a short ID made from the IP, so the same IP always shows the same ID.' },
  { q: 'How do I remove a target group someone saved before?', a: 'Target groups are no longer saved as dropdown options. Old ones can be removed in Settings → Dropdown options.' },
];
