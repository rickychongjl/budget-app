namespace Budget.Domain;

// Amounts stay plain decimals; these guards keep them storable as decimal(18,2).
public static class Money
{
    public const decimal Max = 9_999_999_999_999_999.99m;

    // A transaction amount: positive, or negative for a reversal. Never zero.
    public static decimal Amount(decimal value)
    {
        if (value == 0m)
        {
            throw new DomainException("money.zero", "An amount cannot be zero.");
        }

        return Balance(value);
    }

    // Zero is a category that is tracked but not planned for.
    public static decimal Budget(decimal value)
    {
        if (value < 0m)
        {
            throw new DomainException("money.negative", "A budget cannot be negative.");
        }

        return Balance(value);
    }

    public static decimal Balance(decimal value)
    {
        if (decimal.Round(value, 2) != value)
        {
            throw new DomainException("money.scale", "Money has at most two decimal places.");
        }

        if (Math.Abs(value) > Max)
        {
            throw new DomainException("money.range", "The amount is too large.");
        }

        return value;
    }
}
