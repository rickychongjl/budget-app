using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Budget.Api.Tests;

// ponytail: only the unconfigured half is tested. A host with DataProtection:BlobUri set warms the key ring up at startup,
// which means a real call to Azure with real credentials: slow, and nothing a test run should do. The blob path is proven
// by the first deploy (a session surviving a new revision). Azurite in a container is the upgrade if that is not enough.
[Collection(ApiCollection.Name)]
public sealed class DataProtectionTests(ApiFactory api)
{
    [Fact]
    public void Without_a_blob_uri_the_key_ring_stays_local()
    {
        api.Services.GetRequiredService<IOptions<KeyManagementOptions>>().Value.XmlRepository.Should().BeNull();
    }
}
