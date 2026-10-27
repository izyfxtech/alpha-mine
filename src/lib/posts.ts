export type Block = { t: "p" | "h2" | "callout"; text: string } | { t: "ul"; items: string[] };
export type Post = { slug: string; title: string; description: string; date: string; tag: string; body: Block[] };

export const readingMinutes = (p: Post) => Math.max(1, Math.round(p.body.map((b) => (b.t === "ul" ? b.items.join(" ") : b.text)).join(" ").split(/\s+/).length / 220));

export const POSTS: Post[] = [
  {
    slug: "good-trade-bad-outcome", tag: "Mindset", date: "2026-10-26",
    title: "Why a winning trade can still be a bad trade",
    description: "Judging trades by their result teaches the wrong lessons. Here is how to judge the decision instead.",
    body: [
      { t: "p", text: "Every trader has taken a trade that broke their rules, watched it win, and felt vindicated. That feeling is the most expensive one in trading, because it rewards the decision that should have been punished." },
      { t: "h2", text: "Process and outcome are separate things" },
      { t: "p", text: "A single trade is one draw from a set of possible results. You can follow your plan perfectly and lose, and you can ignore your plan and win. The result of one trade tells you very little about the quality of the decision behind it." },
      { t: "ul", items: ["Good process, good outcome: the plan worked. Repeat it.", "Good process, bad outcome: normal variance. Do not change anything because of one loss.", "Bad process, good outcome: luck. This is the dangerous one, because it teaches you to repeat the mistake.", "Bad process, bad outcome: the lesson is obvious, but only if you recorded the process."] },
      { t: "h2", text: "Define the process before you trade" },
      { t: "p", text: "You cannot judge a decision against rules you never wrote down. Before you place a trade, decide what a valid entry looks like, where the stop goes, and how you will manage the position. Afterwards, ask one question for each part: did I do what I said I would do?" },
      { t: "h2", text: "Score your decisions, not your profit" },
      { t: "p", text: "Tag each trade for the quality of its entry, its management and its exit, separately from the profit and loss. Over a month, two numbers become visible: how disciplined you were, and how much your results depended on luck." },
      { t: "callout", text: "A useful test: if this exact setup appeared again tomorrow, would you want to take it the same way? If yes, the trade was good, whatever it paid." },
      { t: "p", text: "This is the idea behind the tilt meter in AlphaMine. It scores the decisions you control, so a lucky win cannot hide a broken process." },
    ],
  },
  {
    slug: "weekly-trade-review-30-minutes", tag: "Routine", date: "2026-10-26",
    title: "A 30 minute weekly review that actually changes how you trade",
    description: "A simple routine for turning a week of trades into one clear change for the week ahead.",
    body: [
      { t: "p", text: "Most traders log their trades and never look at them again. A short, fixed review turns a pile of records into decisions. This one takes about half an hour and ends with a single change." },
      { t: "h2", text: "Minutes 0 to 5: look at the shape of the week" },
      { t: "p", text: "Open your calendar view before any individual trade. Which days made money, which lost, and how many trades did you take on each? Clusters matter: a heavy losing day after a big win, or a long run of small trades, tells you something no single entry will." },
      { t: "h2", text: "Minutes 5 to 15: read the worst trades first" },
      { t: "p", text: "Sort by result and open your three worst trades. For each one ask whether the loss came from the plan being wrong or from you leaving the plan. Only the first kind is a reason to change the strategy." },
      { t: "h2", text: "Minutes 15 to 22: audit your tags" },
      { t: "p", text: "Count the trades you marked as undisciplined and see when they happened: after a loss, late in the session, on a specific setup. Patterns in timing are usually easier to fix than patterns in analysis." },
      { t: "h2", text: "Minutes 22 to 28: check your best setup" },
      { t: "p", text: "Look at results by setup. Is the setup you trade most also the one that pays best? If not, you have a decision to make about where your attention goes." },
      { t: "h2", text: "Minutes 28 to 30: pick one change" },
      { t: "p", text: "Write one sentence about what you will do differently next week, such as stopping after two losses in a day or skipping one weak setup. One change is enough, and you can only check it if it is specific." },
      { t: "callout", text: "A review that produces five resolutions produces none. End with one." },
    ],
  },
  {
    slug: "expectancy-win-rate-and-r", tag: "Numbers", date: "2026-10-26",
    title: "Win rate is not enough: expectancy and R explained",
    description: "How to combine win rate and average win and loss into one number that shows whether a strategy pays.",
    body: [
      { t: "p", text: "Win rate is the most quoted statistic in trading and one of the least useful on its own. A strategy that wins 70% of the time can lose money, and one that wins 35% of the time can make it. What matters is how the wins and losses compare." },
      { t: "h2", text: "Measuring in R" },
      { t: "p", text: "R is your initial risk on a trade. If you risk 50 dollars, a gain of 100 dollars is 2R and a loss of 50 dollars is minus 1R. Measuring results in R lets you compare trades of different sizes and instruments on one scale." },
      { t: "h2", text: "Expectancy in one line" },
      { t: "p", text: "Expectancy is what you can expect to make per trade, on average: win rate times average win, minus loss rate times average loss." },
      { t: "ul", items: ["Win rate 40%, average win 2R, average loss 1R: 0.4 x 2 minus 0.6 x 1 = plus 0.2R per trade.", "Win rate 60%, average win 0.5R, average loss 1R: 0.6 x 0.5 minus 0.4 x 1 = minus 0.1R per trade."] },
      { t: "p", text: "The second strategy wins more often and still loses money. These are made up numbers to show the arithmetic, not a claim about any real strategy." },
      { t: "h2", text: "The win rate you need to break even" },
      { t: "p", text: "Divide your average win by your average loss to get a ratio. Break even sits at one divided by one plus that ratio. With wins of 2R against losses of 1R, you need to win about 33% of the time. With wins of 0.5R, you need about 67%." },
      { t: "h2", text: "Use enough trades" },
      { t: "p", text: "Expectancy from ten trades is mostly noise. Measure it over a large sample, and measure it per setup, so you can see which parts of your trading carry the edge and which dilute it." },
      { t: "p", text: "Chart Lab and Edge Finder in AlphaMine compute these figures from your journal, and the simulator shows how wide the range of outcomes can be even when expectancy is positive. This article is education, not financial advice." },
    ],
  },
  {
    slug: "what-to-log-in-a-trading-journal", tag: "Journaling", date: "2026-10-26",
    title: "What to log in a trading journal, and what to skip",
    description: "The fields that make a journal useful, and the ones that only make it slow to keep.",
    body: [
      { t: "p", text: "A journal fails in one of two ways: it holds too little to learn from, or it asks for so much that you stop filling it in. The goal is the smallest set of fields that lets you answer real questions later." },
      { t: "h2", text: "The essentials" },
      { t: "ul", items: ["Instrument and direction.", "Entry, stop and exit, so risk and R can be calculated.", "Position size.", "Setup name, from a short list you define yourself.", "Your reason for the trade, in one sentence."] },
      { t: "p", text: "If you import trades from a platform report, most of these arrive automatically, and your effort goes into the last two." },
      { t: "h2", text: "The fields that pay off later" },
      { t: "ul", items: ["A screenshot taken at entry, so you can see what you saw.", "How you managed the trade: did you move the stop, add, or close early?", "Why you exited: target, stop, or a decision made in the moment.", "Discipline tags for entry, management and exit."] },
      { t: "h2", text: "What to skip" },
      { t: "p", text: "Skip anything you will not read. Long mood essays after every trade feel thorough and get abandoned within a fortnight. A short tag takes seconds and can still be counted across hundreds of trades." },
      { t: "h2", text: "Keep your vocabulary small" },
      { t: "p", text: "Ten setups with clear names beat forty with fuzzy ones. If two setups are hard to tell apart when you log them, merge them. Statistics only work when the labels mean the same thing every time." },
      { t: "callout", text: "A good test of any field: what decision will this help me make in a month? If you cannot name one, drop it." },
      { t: "p", text: "In AlphaMine you define your own setups, comment tags and custom statistics, so the journal records what you actually decide on and nothing more." },
    ],
  },
];

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
