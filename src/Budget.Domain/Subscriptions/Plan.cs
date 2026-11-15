namespace Budget.Domain;

// What a user may do. Free unless something grants Premium (Entitlement.Resolve).
public enum Plan
{
    Free,
    Premium,
}
