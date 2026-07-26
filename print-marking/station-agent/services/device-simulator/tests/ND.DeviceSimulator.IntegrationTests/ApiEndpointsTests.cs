using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ND.DeviceSimulator.Application.Dtos;
using Xunit;

namespace ND.DeviceSimulator.IntegrationTests;

public sealed class ApiEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbFilePath;

    public ApiEndpointsTests(WebApplicationFactory<Program> factory)
    {
        var dbName = $"test-simulator-{Guid.NewGuid()}.db";
        _dbFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, dbName);

        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((context, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    { "ConnectionStrings:Sqlite", $"Data Source={_dbFilePath}" }
                });
            });

            builder.ConfigureServices(services =>
            {
                // Remove existing hosted services to prevent port collisions
                var hostedServices = services.Where(d => d.ServiceType == typeof(IHostedService)).ToList();
                foreach (var hs in hostedServices)
                {
                    services.Remove(hs);
                }
            });
        });
    }

    [Fact]
    public async Task GetHealth_ShouldReturnOk()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/health");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetStatus_ShouldReturnOk()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/api/status");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var status = await response.Content.ReadFromJsonAsync<SimulatorStatusDto>();
        status.Should().NotBeNull();
        status!.Vision.Should().NotBeNull();
        status.Plc.Should().NotBeNull();
    }

    [Fact]
    public async Task GetPlcRegisters_ShouldReturnRegisters()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/api/plc/registers");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var registers = await response.Content.ReadFromJsonAsync<Dictionary<string, bool>>();
        registers.Should().NotBeNull();
        registers.Should().ContainKey("START_BUTTON");
    }

    [Fact]
    public async Task GetConfig_ShouldReturnConfigValues()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/api/config");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var configs = await response.Content.ReadFromJsonAsync<List<ConfigValueDto>>();
        configs.Should().NotBeNull();
    }

    public void Dispose()
    {
        _factory.Dispose();
        try
        {
            if (File.Exists(_dbFilePath))
            {
                File.Delete(_dbFilePath);
            }
        }
        catch
        {
            // Ignore clean up errors
        }
    }
}
