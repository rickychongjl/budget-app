# User stories

Terms used below:

- A **cycle** is a fixed 30-day budget period (start date plus the next 29 days). The next cycle starts the day after the previous one ends.
- A **debit** category is money going out (food, rent). A **credit** category is money coming in (income).
- A cycle is **past**, **current** or **future**. The current cycle is the one I am tracking now.
- The **opening balance** is the money I have at the start of a cycle. The **closing balance** is the money I have left when it ends.

### Onboarding
1. As Ricky, when I log in for the first time, I should see no existing data.
2. I set up my budget by adding categories. Each category is either debit or credit, and has a budget amount: a spending limit for a debit category (e.g. food), an expected amount for a credit category (e.g. income).
3. I set the start date of my first cycle. The cycle length is fixed at 30 days and I cannot change it.
4. I enter my opening balance: how much money I have at the start of the cycle.
5. Once the categories, budgets, start date and opening balance are set, I confirm the budget. I cannot record transactions until I have confirmed.

### Transactions (credit/debit)
1. When I spend money, I open the PWA, enter the amount, and search for and choose the debit category it belongs to.
2. When I receive money, I open the PWA, enter the amount, and search for and choose the credit category it belongs to.
3. A new transaction goes into the current cycle by default.
4. I can add, edit or delete a transaction in a past cycle (for something I forgot). When I do, the system prompts me to update that cycle's closing balance as well.

### Dashboard overview
1. I can see the status of my current cycle: how much I have spent or received in each category against its budget. A debit category shows red when I am over its limit. A credit category shows green when I have received more than the expected amount.

### Settings
1. I can modify the categories and budgets of the current cycle and of future cycles at any time.
2. I can see all my budget cycles, including the current one, with their start and end dates.
3. I can change the start date of the current cycle only. This is allowed even when past cycles exist. I can never set an end date: it is always 29 days after the start.
4. The new start date must be after the end of the previous cycle. A gap between the two is allowed; an overlap is not.
5. Before the change is saved, the system tells me it will also move all future cycles (each one starts 30 days after the one before) and asks me to confirm. Past cycles are never moved.
6. If I move the start date while the current cycle already has transactions, those transactions stay in the current cycle, even if their dates now fall before the new start. That is my decision and the system accepts it.
7. Categories and their budgets are a snapshot of the cycle. (This is important for reporting.)
8. Changing a category or its budget affects only that cycle, plus any later cycle that is copied from it.
9. I can add a new category and budget in the middle of a cycle.
10. I can remove a category from a cycle only if it has no transactions in that cycle.
11. When the current cycle is over:
    1. I can enter its closing balance: how much money is left in my bank account. That amount becomes the opening balance of the next cycle.
    2. Its categories and budgets are copied to the next cycle automatically, with no action from me.
12. I cannot change the categories, budgets, start date or opening balance of a past cycle.
13. I can still change the closing balance of a past cycle.

### Reporting
1. I can see a list of all my cycles on one page.
2. When I open a cycle, I see what I spent or received in each category against the budget I set for it. For the current cycle, this lets me spot categories that are over their limit, or heading that way, while I still have time to adjust. For a past cycle, it shows how I finished against my budget.
3. Alongside the list of cycles there is a line graph across cycles.
    1. I can filter it by total spending, or by a single category.
    2. I can also filter it to show how much money I accrued in each cycle (closing balance minus opening balance).
