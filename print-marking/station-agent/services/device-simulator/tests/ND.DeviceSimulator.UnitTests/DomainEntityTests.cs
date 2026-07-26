using FluentAssertions;
using ND.DeviceSimulator.Domain.Entities;
using Xunit;

namespace ND.DeviceSimulator.UnitTests;

public sealed class DomainEntityTests
{
    [Fact]
    public void PrinterJobCreate_ShouldSetProperties()
    {
        // Act
        var job = PrinterJob.Create("^XA^XZ", 250, "PRINTED", null);

        // Assert
        job.ZplContent.Should().Be("^XA^XZ");
        job.DurationMs.Should().Be(250);
        job.Status.Should().Be("PRINTED");
        job.ErrorMessage.Should().BeNull();
        job.ReceivedAt.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void LaserCommandCreate_ShouldSetProperties()
    {
        // Act
        var cmd = LaserCommand.Create("MARK:template:FC-12", 500, "FAILED", "Error occurred");

        // Assert
        cmd.RawCommand.Should().Be("MARK:template:FC-12");
        cmd.DurationMs.Should().Be(500);
        cmd.Status.Should().Be("FAILED");
        cmd.ErrorMessage.Should().Be("Error occurred");
        cmd.ExecutedAt.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void TimelineEventCreate_ShouldSetProperties()
    {
        // Act
        var evt = TimelineEvent.Create("PRINTER_EXECUTED", "OK", "Printed 123");

        // Assert
        evt.Stage.Should().Be("PRINTER_EXECUTED");
        evt.Status.Should().Be("OK");
        evt.Detail.Should().Be("Printed 123");
        evt.OccurredAt.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void VisionResultCreate_ShouldSetProperties()
    {
        // Act
        var result = VisionResult.Create("job-123", "FAIL", 0.45, "LOW_CONTRAST", null, 120);

        // Assert
        result.JobId.Should().Be("job-123");
        result.Result.Should().Be("FAIL");
        result.Confidence.Should().Be(0.45);
        result.DefectCode.Should().Be("LOW_CONTRAST");
        result.OcrText.Should().BeNull();
        result.DurationMs.Should().Be(120);
        result.VerifiedAt.Should().NotBeNullOrEmpty();
    }
}
