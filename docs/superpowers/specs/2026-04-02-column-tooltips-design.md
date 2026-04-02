# Column Tooltips Design

## Summary

Add informational tooltips to column headers in OpportunityTable to explain what each column shows and how values are calculated.

## Approach

Inline SVG info-circle icon after header text, with a portal-based tooltip action (`use:tooltip`) powered by `@floating-ui/dom`. Renders on `document.body` to escape the table's overflow clipping context. Styled to match DaisyUI's tooltip appearance via CSS custom properties.

DaisyUI's built-in CSS tooltip was originally used but replaced because its pseudo-element approach gets clipped inside overflow containers (required by `table-pin-rows`).

## Columns With Tooltips

Tooltips on: **Sell**, **Profit/unit**, **Units**, **Comp**, **Vel**, **Gil/day**.
No tooltips on: **Item**, **Buy from**, **Buy** (self-explanatory).

| Column | Tooltip Text |
|--------|-------------|
| Sell | Estimated sell price: the lower of the cheapest listing and the median recent sale. Second line (if shown) is the current cheapest listing on the market board. |
| Profit/unit | Sell price after 5% tax, minus buy price. Second line (if shown) uses the market board listing instead. |
| Units | Recommended / available at source. Recommended is capped by fair-share velocity × days of supply. |
| Comp | Active competing listings on the home world near the expected sell price. |
| Vel | Your fair share of daily sales: total velocity ÷ (competitors + 1). Second line shows total market velocity. |
| Gil/day | Expected daily profit: profit per unit × fair-share velocity. Second line (if shown) is an alternative source world, for comparison only — all other columns use the primary source. |

## Future Work

A dedicated scoring explanation page with more thorough breakdowns of each component. Tooltips are intentionally concise in anticipation of this.
