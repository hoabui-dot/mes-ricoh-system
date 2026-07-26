using FluentAssertions;
using ND.DeviceSimulator.Infrastructure.State;
using Xunit;

namespace ND.DeviceSimulator.UnitTests;

public sealed class StateServiceTests
{
    private readonly SimulatorStateService _stateService = new();

    [Fact]
    public void InitialState_ShouldBeDefault()
    {
        // Act
        var status = _stateService.GetStatus();

        // Assert
        status.Printer.Online.Should().BeFalse();
        status.Printer.JobCount.Should().Be(0);
        status.Printer.LastZplPreview.Should().BeNull();
        status.Printer.Port.Should().Be(9100);

        status.Laser.Online.Should().BeFalse();
        status.Laser.CommandCount.Should().Be(0);
        status.Laser.Port.Should().Be(8901);

        status.Vision.Online.Should().BeTrue(); // Vision defaults to online in code
        status.Vision.RequestCount.Should().Be(0);
        status.Vision.PassRate.Should().Be(95);
        status.Vision.FailureRate.Should().Be(0);

        status.Plc.Online.Should().BeFalse();
        status.Plc.EventCount.Should().Be(0);
        status.Plc.Port.Should().Be(5020);
        status.Plc.Registers["START_BUTTON"].Should().BeFalse();

        status.Gateway.Connected.Should().BeFalse();
        status.Gateway.PublishCount.Should().Be(0);
        status.Gateway.ReceiveCount.Should().Be(0);
    }

    [Fact]
    public void SetPrinterOnline_ShouldUpdateState()
    {
        // Act
        _stateService.SetPrinterOnline(true);

        // Assert
        _stateService.GetPrinterState().Online.Should().BeTrue();
    }

    [Fact]
    public void RecordPrinterJob_ShouldIncrementCount_AndSetDetails()
    {
        // Act
        _stateService.RecordPrinterJob("^XA^FO50,50^A0N,50,50^FDTest^FS^XZ", "PRINTED");

        // Assert
        var state = _stateService.GetPrinterState();
        state.JobCount.Should().Be(1);
        state.LastZplPreview.Should().Be("^XA^FO50,50^A0N,50,50^FDTest^FS^XZ");
        state.LastResult.Should().Be("PRINTED");
        state.LastJobAt.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void RecordPrinterJob_ShouldTruncateLongZpl()
    {
        // Arrange
        var longZpl = new string('A', 300);

        // Act
        _stateService.RecordPrinterJob(longZpl, "PRINTED");

        // Assert
        var state = _stateService.GetPrinterState();
        state.LastZplPreview.Should().HaveLength(200);
    }

    [Fact]
    public void SetLaserOnline_ShouldUpdateState()
    {
        // Act
        _stateService.SetLaserOnline(true);

        // Assert
        _stateService.GetLaserState().Online.Should().BeTrue();
    }

    [Fact]
    public void RecordLaserCommand_ShouldIncrementCount_AndSetDetails()
    {
        // Act
        _stateService.RecordLaserCommand("MARK:template:FC-12345", "SUCCESS");

        // Assert
        var state = _stateService.GetLaserState();
        state.CommandCount.Should().Be(1);
        state.LastCommand.Should().Be("MARK:template:FC-12345");
        state.LastResult.Should().Be("SUCCESS");
        state.LastCommandAt.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void SetVisionConfig_ShouldClampValues()
    {
        // Act
        _stateService.SetVisionConfig(150, -10);

        // Assert
        var state = _stateService.GetVisionState();
        state.PassRate.Should().Be(100);
        state.FailureRate.Should().Be(0);
    }

    [Fact]
    public void RecordVisionResult_ShouldIncrementCount_AndSetDetails()
    {
        // Act
        _stateService.RecordVisionResult("PASS");

        // Assert
        var state = _stateService.GetVisionState();
        state.RequestCount.Should().Be(1);
        state.LastResult.Should().Be("PASS");
        state.LastRequestAt.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void SetRegister_ShouldUpdatePlcState()
    {
        // Act
        _stateService.SetRegister("START_BUTTON", true);

        // Assert
        _stateService.GetRegister("START_BUTTON").Should().BeTrue();
        _stateService.GetPlcState().Registers["START_BUTTON"].Should().BeTrue();
    }

    [Fact]
    public void SetRegister_CaseInsensitive_ShouldWork()
    {
        // Act
        _stateService.SetRegister("start_button", true);

        // Assert
        _stateService.GetRegister("START_BUTTON").Should().BeTrue();
    }

    [Fact]
    public void RecordPlcEvent_ShouldIncrementCount()
    {
        // Act
        _stateService.RecordPlcEvent();

        // Assert
        var state = _stateService.GetPlcState();
        state.EventCount.Should().Be(1);
        state.LastEventAt.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void SetGatewayConnected_ShouldUpdateState()
    {
        // Act
        _stateService.SetGatewayConnected(true, "mqtt-broker", 1883);

        // Assert
        var state = _stateService.GetGatewayState();
        state.Connected.Should().BeTrue();
        state.BrokerHost.Should().Be("mqtt-broker");
        state.BrokerPort.Should().Be(1883);
    }

    [Fact]
    public void RecordGatewayPublish_ShouldIncrementCount()
    {
        // Act
        _stateService.RecordGatewayPublish("factory/events/marking");

        // Assert
        var state = _stateService.GetGatewayState();
        state.PublishCount.Should().Be(1);
        state.LastTopic.Should().Be("factory/events/marking");
        state.LastEventAt.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void RecordGatewayReceive_ShouldIncrementCount()
    {
        // Act
        _stateService.RecordGatewayReceive("factory/commands/marking");

        // Assert
        var state = _stateService.GetGatewayState();
        state.ReceiveCount.Should().Be(1);
        state.LastTopic.Should().Be("factory/commands/marking");
        state.LastEventAt.Should().NotBeNullOrEmpty();
    }
}
