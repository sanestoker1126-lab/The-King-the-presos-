using System.Diagnostics;
using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;

// Windows desktop launcher. All game files stay local and are served on loopback only.
var gameDirectory = Path.Combine(AppContext.BaseDirectory, "game");
var entry = Path.Combine(gameDirectory, "index.html");
if (!File.Exists(entry))
{
    Console.Error.WriteLine("ERROR: No se encuentra game/index.html. Extrae el ZIP COMPLETO antes de jugar.");
    if (!Console.IsInputRedirected) Console.ReadLine();
    return 1;
}

var port = 0; // Ask Windows for a free port, avoiding clashes with an existing game.
var portIndex = Array.IndexOf(args, "--port");
if (portIndex >= 0 && (portIndex + 1 >= args.Length ||
    !int.TryParse(args[portIndex + 1], out port) || port is < 0 or > 65535))
{
    Console.Error.WriteLine("Puerto invalido.");
    return 2;
}

try
{
    var builder = WebApplication.CreateBuilder(new WebApplicationOptions
    {
        Args = Array.Empty<string>(),
        ContentRootPath = AppContext.BaseDirectory
    });
    builder.Logging.ClearProviders();
    builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, port));
    var app = builder.Build();

    var localFiles = new PhysicalFileProvider(gameDirectory);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = localFiles });
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = localFiles,
        OnPrepareResponse = context =>
        {
            context.Context.Response.Headers.CacheControl = "no-store";
            context.Context.Response.Headers.XContentTypeOptions = "nosniff";
        }
    });
    app.MapGet("/health", () => Results.Text("ok"));

    await app.StartAsync();
    var server = app.Services.GetRequiredService<IServer>();
    var binding = server.Features.Get<IServerAddressesFeature>();
    var url = binding?.Addresses.FirstOrDefault(value => value.StartsWith("http://", StringComparison.OrdinalIgnoreCase));
    if (string.IsNullOrWhiteSpace(url)) throw new InvalidOperationException("No se encontro la direccion local.");

    Console.WriteLine("READY " + url);
    Console.WriteLine("Legend of Presos: listo. Mantén abierta esta ventana para jugar.");
    Console.WriteLine("Usa A/D o flechas para moverte; J/K para atacar y L para especial.");

    if (!args.Contains("--no-browser", StringComparer.Ordinal))
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("No se pudo abrir el navegador: " + error.Message);
            Console.WriteLine("Copia esta direccion en Chrome, Edge o Firefox: " + url);
        }
    }
    await app.WaitForShutdownAsync();
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine("Error al iniciar el servidor local: " + error.Message);
    if (!Console.IsInputRedirected) Console.ReadLine();
    return 3;
}
