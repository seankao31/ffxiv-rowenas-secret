# 羅薇娜的商業機密 — Rowena's Trade Secret

A profit-optimization toolkit for FFXIV players on the 陸行鳥 (Chocobo) TC data center.

> These are the secrets Rowena uses to dominate the economy — and now they're yours.

## Name Runner-ups

| Name | Vibe |
|------|------|
| 塔塔露的如意算盤 | "Tataru's Wishful Abacus" — idiom subversion, her optimistic calculations actually work |
| 塔塔露的金手指 | "Tataru's Golden Finger" — Midas touch + gaming slang for cheat code |
| Tataru's Gambit | Strategic, cool, recognizable |
| Tatarunomics | Tataru + economics portmanteau |
| GilSight | Clean product name, "insight into gil" |

## Feature Ideas

### Cross-World Arbitrage ✅ (built)
Find items cheaper on other worlds, buy and resell on home world for profit. Confidence-weighted scoring accounts for data staleness, velocity, and competition.

### Price Alert Watchlist
Subscribe to a list of items. Send webhook alerts (Discord, etc.) when an item is listed below a set price threshold. Useful for sniping rare deals.

### Crafting Optimizer
Find the cheapest way to craft an item, sourcing ingredients across all worlds in the DC. Factor in crystal costs, sub-component crafting vs buying, and cross-world travel.

### Craft-for-Profit Rankings
Identify the most profitable items to craft — compare total ingredient cost (cross-world optimized) against selling price and velocity on home world.

### Currency Exchange Optimizer
For special currencies (tomestones, scrips, GC seals, beast tribe tokens, bicolor gemstones, etc.), find which purchasable items sell for the most gil per currency unit.

### Gathering Profit Guide
What should you mine, quarry, harvest, or fish right now? Rank gathering nodes by expected gil/hour based on current market prices and gather rates.

### Retainer Venture Optimizer
Optimize retainer dispatches. Compare: sell raw venture loot vs. craft it into half-products first. Factor in retainer class, venture type (quick/exploration/field), and current prices.

### Desynthesis Profit Tracker
Track which items are worth buying to desynthesis. Compare item purchase price against expected value of desynthesis outputs at current market prices.

### Materia Extraction
Which gear to spiritbond and extract materia from? Rank by materia type/grade value vs. time-to-spiritbond and gear acquisition cost.

### Aetherial Reduction
When crystal/cluster prices spike, reducing collectible items becomes very profitable. Track reduction inputs vs. output values.

### Collectible / Scrip Arbitrage
Which collectible turn-ins give the best scrip-to-gil conversion? (Gather/buy collectible → turn in for scrips → buy scrip-exchange item → sell on MB.)

### Treasure Map Valuation
Given current drop table prices, which map tier has the highest expected value to run? Help decide whether to sell maps or run them.

### Leve Turn-in Optimization
Which leve turn-ins give the best gil-per-allowance when buying items off the MB? Useful for burning leve allowances efficiently.

### Cross-World Sell Optimization
Inverse of arbitrage: find the best world to *sell* an item you already have. Useful for crafters and gatherers who want to list where prices are highest, not just buy where they're lowest.

### Undercut Defense Alerts
Notify you (via Discord webhook) when someone undercuts your active listings. Different from buy-side price alerts — this is about defending your sell positions.

### Marketshare / Demand Rankings
Top-selling items by volume on your home server — "what's hot right now." Useful for finding high-turnover items to enter, even if per-unit profit is modest.

### Competition Analysis
How saturated is a specific item's market? Show competitor density, undercut frequency, and how quickly new listings get undercut. Helps decide whether to enter or avoid a market.

### Personal Trade Journal
Track your own trades and cumulative profit/loss over time. See which strategies actually made money vs. which felt profitable but weren't.

### Inventory Value Scanner
Highlight valuable items sitting forgotten in your inventory/retainers. "You have 12 Titanoboa Skins worth 450k total — did you forget about these?"

### Market Intelligence
- **Velocity anomaly detection** — items whose sales velocity just spiked or price just cratered (flip opportunities)
- **Patch speculation tracker** — historical price patterns around patches, raid tiers, and seasonal events
- **Price history trends** — longer-term tracking beyond what Universalis shows
- **Weekly price delta** — week-over-week price changes by item category, spot investment opportunities
- **Extended sale history & graphs** — deeper historical data and visualization beyond Universalis defaults

### Island Sanctuary Workshop
Optimize workshop production each cycle based on demand/supply predictions and MB prices of competing items.

### FC Submarine / Airship Voyages
Which routes yield the most valuable materials at current market prices?

### Grand Company Seals
GC seals are easy to accumulate. Which seal-purchasable items (glamour prisms, dark matter, coke, etc.) currently have the best gil/seal ratio?

## Design Philosophy

- **Data-driven, not gut-driven** — every recommendation backed by current market data
- **Cross-world aware** — always consider all worlds in the DC, not just home world
- **Confidence-weighted** — account for data staleness, not just raw prices
- **Practical** — optimize for realistic profit (velocity, competition, tax), not theoretical maximum
