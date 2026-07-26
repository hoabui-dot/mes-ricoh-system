using Microsoft.EntityFrameworkCore;
using ND.PrinterAdapter.Domain.Entities;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ND.PrinterAdapter.Infrastructure.Persistence;

public static class PrinterDbSeeder
{
    public static async Task SeedAsync(PrinterDbContext db, string host, int port)
    {
        // ── Printers ─────────────────────────────────────────────────────────
        if (!await db.Printers.AnyAsync())
        {
            var p1 = Printer.Create("Printer-01", "Zebra Industrial A", "localhost", 9100, "ZPL", "ZEBRA", driverType: "simulation");
            p1.SetOnline();
            await db.Printers.AddAsync(p1);

            var p2 = Printer.Create("Printer-02", "Zebra Industrial B", "localhost", 9101, "ZPL", "ZEBRA", driverType: "simulation");
            p2.SetOnline();
            await db.Printers.AddAsync(p2);

            var p3 = Printer.Create("Printer-03", "Zebra Industrial C", "localhost", 9102, "ZPL", "ZEBRA", driverType: "simulation");
            p3.SetOnline();
            await db.Printers.AddAsync(p3);

            var pLegacy = Printer.Create("printer-01", "Zebra Kiosk Printer (Legacy)", "localhost", 9100, "ZPL", "ZEBRA", driverType: "simulation");
            pLegacy.SetOnline();
            await db.Printers.AddAsync(pLegacy);

            var cupsQueue = Environment.GetEnvironmentVariable("CUPS_QUEUE") ?? "Zebra_Technologies_ZTC_GK420t";
            var cupsHost = Environment.GetEnvironmentVariable("CUPS_HEALTH_HOST") ?? "host.docker.internal";
            var pCups = Printer.Create("Zebra-GK420t-CUPS", "Zebra GK420t (Physical)", cupsHost, 631, "ZPL", "ZEBRA",
                driverType: "cups", cupsQueueName: cupsQueue);
            await db.Printers.AddAsync(pCups);

            await db.SaveChangesAsync();
        }
        else
        {
            var existingCups = await db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == "Printer-03");
            var cupsCode = "Printer-03";
            var cupsHost = "localhost";
            if (existingCups == null)
            {
                var p3 = Printer.Create(cupsCode, "Zebra Industrial C (CUPS Local)", cupsHost, 9102, "ZPL", "ZEBRA", driverType: "cups", cupsQueueName: "Zebra_ZD420");
                p3.SetOnline();
                await db.Printers.AddAsync(p3);
            }
            else if (existingCups.IpAddress == "localhost" || existingCups.IpAddress == "127.0.0.1")
            {
                await db.Printers
                    .Where(p => p.PrinterCode == cupsCode)
                    .ExecuteUpdateAsync(s => s.SetProperty(p => p.IpAddress, cupsHost));
            }
        }

        // ── Official Vietnamese Label Templates ───────────────────────────────
        await SeedTemplatesAsync(db);
    }

    private static async Task SeedTemplatesAsync(PrinterDbContext db)
    {
        var officialCodes = GetOfficialTemplateCodes();

        // Phase 1: Delete all templates NOT in the official list (legacy + old demo)
        var templatesToDelete = await db.LabelTemplates
            .Where(t => t.TemplateCode == null || !officialCodes.Contains(t.TemplateCode))
            .ToListAsync();

        if (templatesToDelete.Count > 0)
        {
            var idsToDelete = templatesToDelete.Select(t => t.Id).ToList();
            await db.LabelTemplateVersions
                .Where(v => idsToDelete.Contains(v.TemplateId))
                .ExecuteDeleteAsync();

            db.LabelTemplates.RemoveRange(templatesToDelete);
            await db.SaveChangesAsync();
        }

        // Phase 2: Insert official templates (idempotent by template_code)
        var definitions = GetOfficialTemplateDefinitions();

        foreach (var def in definitions)
        {
            // 1-Up (original size)
            await SeedOrUpdateTemplateAsync(db, def.Code, def.Name, def.Description, def.Note, def.Category,
                def.Dpi, def.WidthMm, def.HeightMm, def.Orientation, def.BarcodeTypes, def.PrinterModels, def.StationTypes,
                def.TemplateJson, "1UP", 1, 1, 0.0, def.IsDefault);

            // 2-Up (35x22, 2 columns, gap 2.0 => width 72.0)
            var scaledJson2 = ScaleTemplateJsonTo35x22(def.TemplateJson, def.WidthMm, def.HeightMm);
            var duplicatedJson2 = DuplicateScaledTemplateJson(scaledJson2, 2, 2.0);
            await SeedOrUpdateTemplateAsync(db, def.Code + "-2UP", def.Name + " (2-Up)", def.Description, def.Note, def.Category,
                def.Dpi, 72.0, 22.0, def.Orientation, def.BarcodeTypes, def.PrinterModels, def.StationTypes,
                duplicatedJson2, "2UP", 2, 1, 2.0, false);

            // 3-Up (35x22, 3 columns, gap 2.0 => width 109.0)
            var scaledJson3 = ScaleTemplateJsonTo35x22(def.TemplateJson, def.WidthMm, def.HeightMm);
            var duplicatedJson3 = DuplicateScaledTemplateJson(scaledJson3, 3, 2.0);
            await SeedOrUpdateTemplateAsync(db, def.Code + "-3UP", def.Name + " (3-Up)", def.Description, def.Note, def.Category,
                def.Dpi, 109.0, 22.0, def.Orientation, def.BarcodeTypes, def.PrinterModels, def.StationTypes,
                duplicatedJson3, "3UP", 3, 1, 2.0, false);
        }

        await db.SaveChangesAsync();
    }

    private static string DuplicateScaledTemplateJson(string scaledSingleJson, int cols, double gapMm)
    {
        try
        {
            var node = JsonNode.Parse(scaledSingleJson);
            if (node == null) return scaledSingleJson;

            int dpi = node["dpi"]?.GetValue<int>() ?? 203;
            double singleW = 35.0;
            double singleH = 22.0;

            double targetW = singleW * cols + gapMm * (cols - 1);
            double targetH = singleH;

            node["width"] = targetW;
            node["height"] = targetH;

            var elements = node["elements"]?.AsArray();
            if (elements != null)
            {
                var newElements = new JsonArray();
                for (int c = 0; c < cols; c++)
                {
                    int offsetDots = (int)Math.Round(c * (singleW + gapMm) * (dpi / 25.4));
                    foreach (var el in elements)
                    {
                        if (el == null) continue;
                        var elCopy = el.DeepClone();
                        if (elCopy["x"] != null)
                        {
                            var xVal = elCopy["x"]!.GetValue<double>();
                            elCopy["x"] = (int)(xVal + offsetDots);
                        }
                        newElements.Add(elCopy);
                    }
                }
                node["elements"] = newElements;
            }

            return node.ToJsonString();
        }
        catch
        {
            return scaledSingleJson;
        }
    }

    private static async Task SeedOrUpdateTemplateAsync(
        PrinterDbContext db, string code, string name, string description, string note, string category,
        int dpi, double width, double height, string orientation, string barcodeTypes, string printerModels, string stationTypes,
        string templateJson, string layoutType, int sheetColumns, int sheetRows, double gapMm, bool isDefault)
    {
        var existing = await db.LabelTemplates.FirstOrDefaultAsync(t => t.TemplateCode == code);
        if (existing == null)
        {
            var tmpl = LabelTemplate.Create(
                name: name,
                description: description,
                dpi: dpi,
                labelWidth: width,
                labelHeight: height,
                templateJson: templateJson,
                status: "published",
                createdBy: "system",
                note: note,
                templateCode: code,
                category: category,
                orientation: orientation,
                revision: "A",
                supportedBarcodeTypes: barcodeTypes,
                supportedPrinterModels: printerModels,
                compatibleStationTypes: stationTypes,
                layoutType: layoutType,
                sheetColumns: sheetColumns,
                sheetRows: sheetRows,
                gapMm: gapMm
            );

            if (isDefault)
                tmpl.SetAsDefault();

            await db.LabelTemplates.AddAsync(tmpl);
        }
        else
        {
            existing.Update(
                name: name,
                description: description,
                dpi: dpi,
                labelWidth: width,
                labelHeight: height,
                templateJson: templateJson,
                updatedBy: "system",
                note: note,
                templateCode: code,
                category: category,
                orientation: orientation,
                revision: "A",
                supportedBarcodeTypes: barcodeTypes,
                supportedPrinterModels: printerModels,
                compatibleStationTypes: stationTypes,
                gapMm: gapMm
            );
            if (isDefault)
                existing.SetAsDefault();
            else
                existing.UnsetDefault();
        }
    }

    private static string ScaleTemplateJsonTo35x22(string json, double origW, double origH)
    {
        try
        {
            var node = JsonNode.Parse(json);
            if (node == null) return json;

            node["width"] = 35;
            node["height"] = 22;

            double scaleX = 35.0 / origW;
            double scaleY = 22.0 / origH;

            var elements = node["elements"]?.AsArray();
            if (elements != null)
            {
                foreach (var el in elements)
                {
                    if (el == null) continue;

                    var type = el["type"]?.GetValue<string>();

                    if (el["x"] != null)
                    {
                        var xVal = el["x"]!.GetValue<double>();
                        el["x"] = (int)(xVal * scaleX);
                    }
                    if (el["y"] != null)
                    {
                        var yVal = el["y"]!.GetValue<double>();
                        el["y"] = (int)(yVal * scaleY);
                    }

                    if (type == "text")
                    {
                        if (el["fontSize"] != null)
                        {
                            var fs = el["fontSize"]!.GetValue<double>();
                            el["fontSize"] = Math.Max(5, (int)(fs * Math.Min(scaleX, scaleY)));
                        }
                    }
                    else if (type == "barcode")
                    {
                        if (el["height"] != null)
                        {
                            var h = el["height"]!.GetValue<double>();
                            el["height"] = Math.Max(10, (int)(h * scaleY));
                        }
                        if (el["barWidth"] != null)
                        {
                            var bw = el["barWidth"]!.GetValue<double>();
                            el["barWidth"] = Math.Max(1, (int)(bw * scaleX));
                        }
                    }
                    else if (type == "qr")
                    {
                        if (el["magnification"] != null)
                        {
                            var mag = el["magnification"]!.GetValue<double>();
                            el["magnification"] = Math.Max(1, (int)(mag * Math.Min(scaleX, scaleY)));
                        }
                    }
                    else if (type == "line" || type == "rect")
                    {
                        if (el["width"] != null)
                        {
                            var w = el["width"]!.GetValue<double>();
                            el["width"] = Math.Max(1, (int)(w * scaleX));
                        }
                        if (el["height"] != null)
                        {
                            var h = el["height"]!.GetValue<double>();
                            el["height"] = Math.Max(1, (int)(h * scaleY));
                        }
                        if (el["strokeWidth"] != null)
                        {
                            var sw = el["strokeWidth"]!.GetValue<double>();
                            el["strokeWidth"] = Math.Max(1, (int)(sw * Math.Min(scaleX, scaleY)));
                        }
                    }
                }
            }

            return node.ToJsonString();
        }
        catch
        {
            return json;
        }
    }

    private static HashSet<string> GetOfficialTemplateCodes()
    {
        var codes = new HashSet<string>(StringComparer.Ordinal);
        var baseCodes = new[] {
            "LBL-KHO-50x30",
            "LBL-SAT-100x60",
            "LBL-TAM-SAT-100x80",
            "LBL-PALLET-100x150",
            "LBL-SHEET-LARGE-80x50",
            "LBL-SHEET-SMALL-50x30",
            "LBL-WIP-60x40",
            "LBL-ISSUE-100x60"
        };
        foreach (var bc in baseCodes)
        {
            codes.Add(bc);
            codes.Add(bc + "-2UP");
            codes.Add(bc + "-3UP");
        }
        return codes;
    }

    private record TemplateDefinition(
        string Code, string Name, string Description, string Note, string Category,
        int Dpi, double WidthMm, double HeightMm, string Orientation,
        string BarcodeTypes, string PrinterModels, string StationTypes,
        string TemplateJson, bool IsDefault = false);

    private static IReadOnlyList<TemplateDefinition> GetOfficialTemplateDefinitions() =>
        new List<TemplateDefinition>
        {
            new(
                Code: "LBL-KHO-50x30",
                Name: "Vị trí kho / kệ / ô chứa",
                Description: "Tem định vị dùng để nhận diện vị trí lưu trữ trong kho, kệ hoặc ô chứa.",
                Note: "Dán cố định tại kệ, ô kho.",
                Category: "Kho",
                Dpi: 203, WidthMm: 50, HeightMm: 30, Orientation: "LANDSCAPE",
                BarcodeTypes: "[\"CODE128\",\"QR\"]",
                PrinterModels: "[\"GK420t\",\"ZD420\",\"ZT230\"]",
                StationTypes: "[\"WAREHOUSE\",\"PRINT_STATION\"]",
                IsDefault: true,
                TemplateJson: """
                    {
                      "width": 50, "height": 30, "dpi": 203,
                      "elements": [
                        { "type": "text", "x": 10, "y": 12, "fontSize": 8, "text": "VI TRI KHO" },
                        { "type": "text", "x": 10, "y": 45, "fontSize": 18, "binding": "location_code", "defaultValue": "A-01-03" },
                        { "type": "text", "x": 10, "y": 100, "fontSize": 7, "binding": "zone", "defaultValue": "Khu A - Ke 1" },
                        { "type": "barcode", "x": 10, "y": 125, "height": 50, "symbology": "CODE128", "barWidth": 2, "binding": "location_code", "defaultValue": "A-01-03" },
                        { "type": "qr", "x": 300, "y": 30, "magnification": 3, "binding": "location_code", "defaultValue": "A-01-03" }
                      ]
                    }
                    """),

            new(
                Code: "LBL-SAT-100x60",
                Name: "Bó sắt / kiện sắt",
                Description: "Tem nhận diện bó hoặc kiện sắt phục vụ quản lý kho và truy xuất.",
                Note: "Nên có mã vật tư, lot, khối lượng.",
                Category: "Thành phẩm",
                Dpi: 203, WidthMm: 100, HeightMm: 60, Orientation: "LANDSCAPE",
                BarcodeTypes: "[\"CODE128\"]",
                PrinterModels: "[\"GK420t\",\"ZT230\",\"ZT410\"]",
                StationTypes: "[\"WAREHOUSE\",\"PRINT_STATION\"]",
                TemplateJson: """
                    {
                      "width": 100, "height": 60, "dpi": 203,
                      "elements": [
                        { "type": "rect", "x": 5, "y": 5, "width": 790, "height": 470, "strokeWidth": 3 },
                        { "type": "text", "x": 15, "y": 18, "fontSize": 14, "text": "BO SAT / KIEN SAT" },
                        { "type": "line", "x": 5, "y": 60, "width": 790, "height": 2 },
                        { "type": "text", "x": 15, "y": 80, "fontSize": 9, "text": "Ma vat tu:" },
                        { "type": "text", "x": 130, "y": 80, "fontSize": 11, "binding": "material_code", "defaultValue": "SAT-001" },
                        { "type": "text", "x": 15, "y": 120, "fontSize": 9, "text": "Lot No:" },
                        { "type": "text", "x": 130, "y": 120, "fontSize": 11, "binding": "lot_number", "defaultValue": "LOT-2026-07-A" },
                        { "type": "text", "x": 15, "y": 160, "fontSize": 9, "text": "Khoi luong (kg):" },
                        { "type": "text", "x": 220, "y": 160, "fontSize": 11, "binding": "weight", "defaultValue": "100.0" },
                        { "type": "text", "x": 15, "y": 200, "fontSize": 9, "text": "Ngay sx:" },
                        { "type": "text", "x": 130, "y": 200, "fontSize": 9, "binding": "production_date", "defaultValue": "2026-07-09" },
                        { "type": "barcode", "x": 15, "y": 240, "height": 100, "symbology": "CODE128", "barWidth": 3, "binding": "serial_number", "defaultValue": "SAT-000001" },
                        { "type": "text", "x": 15, "y": 350, "fontSize": 7, "binding": "serial_number", "defaultValue": "SAT-000001" }
                      ]
                    }
                    """),

            new(
                Code: "LBL-TAM-SAT-100x80",
                Name: "Tấm sắt / cuộn sắt",
                Description: "Tem quản lý tấm hoặc cuộn sắt.",
                Note: "Dùng tem PET hoặc thẻ treo vì bề mặt khó dán.",
                Category: "Nguyên vật liệu",
                Dpi: 203, WidthMm: 100, HeightMm: 80, Orientation: "PORTRAIT",
                BarcodeTypes: "[\"CODE128\"]",
                PrinterModels: "[\"ZT230\",\"ZT410\",\"ZT610\"]",
                StationTypes: "[\"WAREHOUSE\",\"MATERIAL_STATION\"]",
                TemplateJson: """
                    {
                      "width": 100, "height": 80, "dpi": 203,
                      "elements": [
                        { "type": "text", "x": 15, "y": 15, "fontSize": 14, "text": "TAM SAT / CUON SAT" },
                        { "type": "line", "x": 5, "y": 55, "width": 790, "height": 2 },
                        { "type": "text", "x": 15, "y": 70, "fontSize": 9, "text": "Vat lieu:" },
                        { "type": "text", "x": 130, "y": 70, "fontSize": 11, "binding": "material", "defaultValue": "Thep CT3" },
                        { "type": "text", "x": 15, "y": 110, "fontSize": 9, "text": "Lot No:" },
                        { "type": "text", "x": 130, "y": 110, "fontSize": 11, "binding": "lot_number", "defaultValue": "LOT-2026-07-A" },
                        { "type": "text", "x": 15, "y": 150, "fontSize": 9, "text": "Cuon/Tam ID:" },
                        { "type": "text", "x": 180, "y": 150, "fontSize": 11, "binding": "serial_number", "defaultValue": "CUON-001" },
                        { "type": "text", "x": 15, "y": 190, "fontSize": 9, "text": "Trong luong (kg):" },
                        { "type": "text", "x": 230, "y": 190, "fontSize": 11, "binding": "weight", "defaultValue": "500.0" },
                        { "type": "text", "x": 15, "y": 230, "fontSize": 9, "text": "Ngay nhap:" },
                        { "type": "text", "x": 130, "y": 230, "fontSize": 9, "binding": "manufacture_date", "defaultValue": "2026-07-09" },
                        { "type": "barcode", "x": 15, "y": 280, "height": 130, "symbology": "CODE128", "barWidth": 3, "binding": "serial_number", "defaultValue": "CUON-001" },
                        { "type": "text", "x": 15, "y": 420, "fontSize": 7, "binding": "lot_number", "defaultValue": "LOT-2026-07-A" }
                      ]
                    }
                    """),

            new(
                Code: "LBL-PALLET-100x150",
                Name: "Pallet hàng",
                Description: "Tem nhận diện pallet hàng phục vụ xuất nhập kho.",
                Note: "Dễ quét từ xa bằng PDA.",
                Category: "Pallet",
                Dpi: 203, WidthMm: 100, HeightMm: 150, Orientation: "PORTRAIT",
                BarcodeTypes: "[\"CODE128\",\"QR\"]",
                PrinterModels: "[\"ZT410\",\"ZT610\",\"ZT620\"]",
                StationTypes: "[\"WAREHOUSE\",\"SHIPPING_STATION\"]",
                TemplateJson: """
                    {
                      "width": 100, "height": 150, "dpi": 203,
                      "elements": [
                        { "type": "rect", "x": 5, "y": 5, "width": 790, "height": 1190, "strokeWidth": 4 },
                        { "type": "text", "x": 20, "y": 20, "fontSize": 18, "text": "PALLET HANG" },
                        { "type": "line", "x": 5, "y": 75, "width": 790, "height": 3 },
                        { "type": "qr", "x": 30, "y": 90, "magnification": 8, "payloadTemplate": "{\"pallet\":\"{serial_number}\",\"po\":\"{production_order}\"}" },
                        { "type": "text", "x": 430, "y": 90, "fontSize": 8, "text": "Don hang:" },
                        { "type": "text", "x": 430, "y": 120, "fontSize": 11, "binding": "production_order", "defaultValue": "PO-2026-001" },
                        { "type": "text", "x": 430, "y": 160, "fontSize": 8, "text": "San pham:" },
                        { "type": "text", "x": 430, "y": 190, "fontSize": 10, "binding": "product_code", "defaultValue": "SP-001" },
                        { "type": "text", "x": 430, "y": 230, "fontSize": 8, "text": "Pallet ID:" },
                        { "type": "text", "x": 430, "y": 260, "fontSize": 10, "binding": "serial_number", "defaultValue": "PLT-001" },
                        { "type": "text", "x": 430, "y": 300, "fontSize": 8, "text": "So luong:" },
                        { "type": "text", "x": 430, "y": 330, "fontSize": 14, "binding": "quantity", "defaultValue": "100" },
                        { "type": "text", "x": 430, "y": 380, "fontSize": 8, "text": "Diem den:" },
                        { "type": "text", "x": 430, "y": 410, "fontSize": 9, "binding": "destination", "defaultValue": "KHO A" },
                        { "type": "line", "x": 5, "y": 490, "width": 790, "height": 3 },
                        { "type": "text", "x": 20, "y": 510, "fontSize": 8, "text": "Ngay:" },
                        { "type": "text", "x": 100, "y": 510, "fontSize": 9, "binding": "manufacture_date", "defaultValue": "2026-07-09" },
                        { "type": "barcode", "x": 20, "y": 600, "height": 150, "symbology": "CODE128", "barWidth": 4, "binding": "serial_number", "defaultValue": "PLT-001" },
                        { "type": "text", "x": 20, "y": 760, "fontSize": 7, "binding": "serial_number", "defaultValue": "PLT-001" }
                      ]
                    }
                    """),

            new(
                Code: "LBL-SHEET-LARGE-80x50",
                Name: "Tấm cao su lớn",
                Description: "Tem quản lý tấm cao su lớn.",
                Note: "Quản lý mã tấm cha Parent Sheet ID.",
                Category: "Tấm cao su",
                Dpi: 203, WidthMm: 80, HeightMm: 50, Orientation: "LANDSCAPE",
                BarcodeTypes: "[\"QR\"]",
                PrinterModels: "[\"GK420t\",\"ZT230\"]",
                StationTypes: "[\"MATERIAL_STATION\",\"PRINT_STATION\"]",
                TemplateJson: """
                    {
                      "width": 80, "height": 50, "dpi": 203,
                      "elements": [
                        { "type": "text", "x": 10, "y": 12, "fontSize": 11, "text": "TAM CAO SU LON" },
                        { "type": "line", "x": 5, "y": 45, "width": 530, "height": 2 },
                        { "type": "text", "x": 10, "y": 60, "fontSize": 9, "text": "Ma tam cha:" },
                        { "type": "text", "x": 140, "y": 60, "fontSize": 11, "binding": "serial_number", "defaultValue": "SHEET-P-001" },
                        { "type": "text", "x": 10, "y": 100, "fontSize": 9, "text": "Vat lieu:" },
                        { "type": "text", "x": 120, "y": 100, "fontSize": 10, "binding": "material", "defaultValue": "NBR-70" },
                        { "type": "text", "x": 10, "y": 140, "fontSize": 9, "text": "Lot:" },
                        { "type": "text", "x": 80, "y": 140, "fontSize": 9, "binding": "lot_number", "defaultValue": "LOT-2026-07-A" },
                        { "type": "text", "x": 10, "y": 180, "fontSize": 9, "text": "Kich thuoc:" },
                        { "type": "text", "x": 130, "y": 180, "fontSize": 9, "binding": "sheet_size", "defaultValue": "1200x600mm" },
                        { "type": "text", "x": 10, "y": 220, "fontSize": 8, "binding": "manufacture_date", "defaultValue": "2026-07-09" },
                        { "type": "qr", "x": 570, "y": 40, "magnification": 6, "payloadTemplate": "{\"sheet\":\"{serial_number}\",\"lot\":\"{lot_number}\"}" }
                      ]
                    }
                    """),

            new(
                Code: "LBL-SHEET-SMALL-50x30",
                Name: "Tấm cao su nhỏ sau khi cắt",
                Description: "Tem quản lý từng tấm cao su sau khi cắt.",
                Note: "Mỗi tấm con có mã riêng.",
                Category: "Tấm cao su",
                Dpi: 203, WidthMm: 50, HeightMm: 30, Orientation: "LANDSCAPE",
                BarcodeTypes: "[\"QR\"]",
                PrinterModels: "[\"GK420t\",\"ZD420\"]",
                StationTypes: "[\"MATERIAL_STATION\",\"PRINT_STATION\"]",
                TemplateJson: """
                    {
                      "width": 50, "height": 30, "dpi": 203,
                      "elements": [
                        { "type": "text", "x": 8, "y": 10, "fontSize": 9, "text": "TAM CAO SU NHO" },
                        { "type": "text", "x": 8, "y": 40, "fontSize": 8, "binding": "serial_number", "defaultValue": "SHEET-C-001" },
                        { "type": "text", "x": 8, "y": 70, "fontSize": 7, "binding": "lot_number", "defaultValue": "LOT-2026-07-A" },
                        { "type": "text", "x": 8, "y": 100, "fontSize": 7, "text": "Tam cha:" },
                        { "type": "text", "x": 100, "y": 100, "fontSize": 7, "binding": "parent_id", "defaultValue": "SHEET-P-001" },
                        { "type": "text", "x": 8, "y": 130, "fontSize": 7, "binding": "manufacture_date", "defaultValue": "2026-07-09" },
                        { "type": "qr", "x": 270, "y": 30, "magnification": 3, "binding": "serial_number", "defaultValue": "SHEET-C-001" }
                      ]
                    }
                    """),

            new(
                Code: "LBL-WIP-60x40",
                Name: "Bán thành phẩm/WIP trong MES",
                Description: "Tem theo dõi bán thành phẩm trong quá trình sản xuất.",
                Note: "Dùng để theo dõi theo công đoạn.",
                Category: "WIP",
                Dpi: 203, WidthMm: 60, HeightMm: 40, Orientation: "LANDSCAPE",
                BarcodeTypes: "[\"QR\"]",
                PrinterModels: "[\"GK420t\",\"ZD420\",\"ZT230\"]",
                StationTypes: "[\"PRINT_STATION\",\"MARK_STATION\",\"WIP_STATION\"]",
                TemplateJson: """
                    {
                      "width": 60, "height": 40, "dpi": 203,
                      "elements": [
                        { "type": "text", "x": 8, "y": 10, "fontSize": 11, "text": "BAN THANH PHAM" },
                        { "type": "line", "x": 5, "y": 40, "width": 470, "height": 2 },
                        { "type": "text", "x": 8, "y": 55, "fontSize": 9, "text": "Serial:" },
                        { "type": "text", "x": 95, "y": 55, "fontSize": 10, "binding": "serial_number", "defaultValue": "SN-000001" },
                        { "type": "text", "x": 8, "y": 90, "fontSize": 9, "text": "San pham:" },
                        { "type": "text", "x": 110, "y": 90, "fontSize": 9, "binding": "product_code", "defaultValue": "SP-001" },
                        { "type": "text", "x": 8, "y": 125, "fontSize": 9, "text": "Cong doan:" },
                        { "type": "text", "x": 120, "y": 125, "fontSize": 9, "binding": "operation", "defaultValue": "CAT" },
                        { "type": "text", "x": 8, "y": 160, "fontSize": 8, "text": "Tram:" },
                        { "type": "text", "x": 80, "y": 160, "fontSize": 8, "binding": "station", "defaultValue": "STATION-01" },
                        { "type": "text", "x": 8, "y": 190, "fontSize": 7, "binding": "production_date", "defaultValue": "2026-07-09" },
                        { "type": "qr", "x": 500, "y": 25, "magnification": 5, "payloadTemplate": "{\"sn\":\"{serial_number}\",\"op\":\"{operation}\"}" }
                      ]
                    }
                    """),

            new(
                Code: "LBL-ISSUE-100x60",
                Name: "Phiếu cấp liệu / phiếu xuất kho",
                Description: "Tem phục vụ cấp liệu và xuất kho.",
                Note: "Dùng cho WMS cấp liệu sang MES.",
                Category: "WMS",
                Dpi: 203, WidthMm: 100, HeightMm: 60, Orientation: "LANDSCAPE",
                BarcodeTypes: "[\"CODE128\",\"QR\"]",
                PrinterModels: "[\"GK420t\",\"ZT230\",\"ZT410\"]",
                StationTypes: "[\"WAREHOUSE\",\"MATERIAL_STATION\"]",
                TemplateJson: """
                    {
                      "width": 100, "height": 60, "dpi": 203,
                      "elements": [
                        { "type": "text", "x": 15, "y": 15, "fontSize": 14, "text": "PHIEU CAP LIEU / XUAT KHO" },
                        { "type": "line", "x": 5, "y": 55, "width": 790, "height": 2 },
                        { "type": "text", "x": 15, "y": 70, "fontSize": 9, "text": "Vat lieu:" },
                        { "type": "text", "x": 130, "y": 70, "fontSize": 11, "binding": "material", "defaultValue": "Cao su NBR-70" },
                        { "type": "text", "x": 15, "y": 110, "fontSize": 9, "text": "So phieu:" },
                        { "type": "text", "x": 130, "y": 110, "fontSize": 10, "binding": "serial_number", "defaultValue": "ISSUE-001" },
                        { "type": "text", "x": 15, "y": 150, "fontSize": 9, "text": "Tu kho:" },
                        { "type": "text", "x": 100, "y": 150, "fontSize": 9, "binding": "source_location", "defaultValue": "KHO-A" },
                        { "type": "text", "x": 15, "y": 185, "fontSize": 9, "text": "Den:" },
                        { "type": "text", "x": 60, "y": 185, "fontSize": 9, "binding": "destination", "defaultValue": "SX-01" },
                        { "type": "text", "x": 15, "y": 220, "fontSize": 9, "text": "So luong:" },
                        { "type": "text", "x": 120, "y": 220, "fontSize": 11, "binding": "quantity", "defaultValue": "50" },
                        { "type": "text", "x": 250, "y": 220, "fontSize": 8, "binding": "manufacture_date", "defaultValue": "2026-07-09" },
                        { "type": "barcode", "x": 15, "y": 260, "height": 80, "symbology": "CODE128", "barWidth": 2, "binding": "serial_number", "defaultValue": "ISSUE-001" },
                        { "type": "qr", "x": 620, "y": 60, "magnification": 5, "payloadTemplate": "{\"issue\":\"{serial_number}\",\"qty\":\"{quantity}\"}" }
                      ]
                    }
                    """)
        };
}
