using System.Net.Sockets;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using ND.DeviceSimulator.Application.Abstractions;
using ND.DeviceSimulator.Infrastructure.Hubs;
using ND.DeviceSimulator.Infrastructure.Persistence;
using ND.DeviceSimulator.Infrastructure.State;
using ND.DeviceSimulator.Infrastructure.VirtualDevices;
using Xunit;

namespace ND.DeviceSimulator.IntegrationTests;

public sealed class TcpEmulatorsTests
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly SimulatorStateService _state;
    private readonly Mock<IHubContext<SimulatorHub, ISimulatorClient>> _hubMock;
    private readonly IConfiguration _config;

    public TcpEmulatorsTests()
    {
        var services = new ServiceCollection();
        services.AddDbContext<SimulatorDbContext>(opt => opt.UseInMemoryDatabase(Guid.NewGuid().ToString()));
        var sp = services.BuildServiceProvider();
        _scopeFactory = sp.GetRequiredService<IServiceScopeFactory>();

        _state = new SimulatorStateService();

        _hubMock = new Mock<IHubContext<SimulatorHub, ISimulatorClient>>();
        var clientsMock = new Mock<IHubClients<ISimulatorClient>>();
        var clientMock = new Mock<ISimulatorClient>();
        _hubMock.Setup(h => h.Clients).Returns(clientsMock.Object);
        clientsMock.Setup(c => c.All).Returns(clientMock.Object);

        var myConfiguration = new Dictionary<string, string?>
        {
            { "Simulator:PRINTER_PORT", "19100" },
            { "Simulator:LASER_PORT", "18901" },
            { "Simulator:PLC_PORT", "15020" },
            { "Simulator:PRINTER_DELAY_MS", "1" },
            { "Simulator:LASER_DELAY_MS", "1" },
            { "Simulator:PRINTER_FAILURE_RATE", "0" },
            { "Simulator:LASER_FAILURE_RATE", "0" }
        };

        _config = new ConfigurationBuilder()
            .AddInMemoryCollection(myConfiguration)
            .Build();
    }

    [Fact]
    public async Task VirtualPrinterServer_ShouldAcceptZpl_AndReturnAck()
    {
        // Arrange
        var server = new VirtualPrinterServer(_scopeFactory, _state, _hubMock.Object, _config, NullLogger<VirtualPrinterServer>.Instance);
        var cts = new CancellationTokenSource();

        try
        {
            // Act
            await server.StartAsync(cts.Token);
            await Task.Delay(100); // Give the TCP socket listener a brief moment to start

            using var client = new TcpClient("localhost", 19100);
            using var stream = client.GetStream();
            
            var zpl = "^XA^FO50,50^A0N,50,50^FDTest^FS^XZ";
            var bytes = Encoding.ASCII.GetBytes(zpl);
            await stream.WriteAsync(bytes, cts.Token);
            client.Client.Shutdown(SocketShutdown.Send); // Signal EOF to reader loop

            using var reader = new StreamReader(stream, Encoding.ASCII);
            var response = await reader.ReadLineAsync(cts.Token);

            // Assert
            response.Should().Be("ACK");
            _state.GetPrinterState().JobCount.Should().Be(1);
            _state.GetPrinterState().LastResult.Should().Be("PRINTED");
        }
        finally
        {
            cts.Cancel();
            await server.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task VirtualLaserServer_ShouldAcceptMarkCommand_AndReturnSuccess()
    {
        // Arrange
        var server = new VirtualLaserServer(_scopeFactory, _state, _hubMock.Object, _config, NullLogger<VirtualLaserServer>.Instance);
        var cts = new CancellationTokenSource();

        try
        {
            // Act
            await server.StartAsync(cts.Token);
            await Task.Delay(100); // Wait for listener

            using var client = new TcpClient("localhost", 18901);
            using var stream = client.GetStream();
            using var writer = new StreamWriter(stream, Encoding.ASCII) { AutoFlush = true };
            using var reader = new StreamReader(stream, Encoding.ASCII);

            await writer.WriteLineAsync("MARK:template:FC-12345");
            var response = await reader.ReadLineAsync(cts.Token);

            // Assert
            response.Should().StartWith("SUCCESS");
            _state.GetLaserState().CommandCount.Should().Be(1);
            _state.GetLaserState().LastResult.Should().Be("SUCCESS");
        }
        finally
        {
            cts.Cancel();
            await server.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task VirtualPlcServer_ShouldAcceptModbusFC05_AndToggleRegister()
    {
        // Arrange
        var server = new VirtualPlcServer(_scopeFactory, _state, _hubMock.Object, _config, NullLogger<VirtualPlcServer>.Instance);
        var cts = new CancellationTokenSource();

        try
        {
            // Act
            await server.StartAsync(cts.Token);
            await Task.Delay(100); // Wait for listener

            using var client = new TcpClient("localhost", 15020);
            using var stream = client.GetStream();

            // Modbus FC05 Write Single Coil: Coil 0 (START_BUTTON) -> ON (0xFF00)
            // MBAP: [0x00, 0x01] (TxId), [0x00, 0x00] (ProtoId), [0x00, 0x06] (Length), [0x01] (UnitId)
            // PDU: [0x05] (FC), [0x00, 0x00] (Addr), [0xFF, 0x00] (Value)
            var request = new byte[] { 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x01, 0x05, 0x00, 0x00, 0xFF, 0x00 };
            await stream.WriteAsync(request, cts.Token);

            var response = new byte[12];
            var readTotal = 0;
            while (readTotal < 12)
            {
                var read = await stream.ReadAsync(response.AsMemory(readTotal), cts.Token);
                if (read == 0) break;
                readTotal += read;
            }

            // Assert
            readTotal.Should().Be(12);
            response[7].Should().Be(0x05); // FC
            response[10].Should().Be(0xFF); // ON
            _state.GetRegister("START_BUTTON").Should().BeTrue();
            _state.GetPlcState().EventCount.Should().Be(1);
        }
        finally
        {
            cts.Cancel();
            await server.StopAsync(CancellationToken.None);
        }
    }
}
