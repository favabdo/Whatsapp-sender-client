using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        try
        {
            var root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (string.IsNullOrEmpty(root))
            {
                MessageBox.Show("Could not resolve app folder.", "WhatsApp Sender",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            var indexHtml = Path.Combine(root, "frontend", "dist", "index.html");

            if (!File.Exists(indexHtml))
            {
                MessageBox.Show(
                    "UI build missing (frontend\\dist).\nRebuild the client package.",
                    "WhatsApp Sender",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            // Electron runtime: check multiple locations so the app works whether
            // shipped via npm (node_modules) or bundled as a portable package.
            var electron = FindElectron(root);
            if (string.IsNullOrEmpty(electron))
            {
                MessageBox.Show(
                    "Electron is missing.\nRe-download the full client package.",
                    "WhatsApp Sender",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            // Quiet cleanup like the previous launcher (no logic change to sending)
            TrySilent("cmd.exe",
                "/c for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do taskkill /PID %a /F /T >nul 2>&1");
            TrySilent("cmd.exe", "/c taskkill /IM chromedriver.exe /F /T >nul 2>&1");

            var psi = new ProcessStartInfo
            {
                FileName = electron,
                Arguments = "\"" + root + "\"",
                WorkingDirectory = root,
                UseShellExecute = true,
            };
            Process.Start(psi);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "WhatsApp Sender",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string FindElectron(string root)
    {
        // Preferred: standard npm install location
        var candidates = new[]
        {
            Path.Combine(root, "node_modules", "electron", "dist", "electron.exe"),
            // Bundled runtime (portable package)
            Path.Combine(root, "_internal", "electron", "dist", "electron.exe"),
            Path.Combine(root, "electron_runtime.exe"),
            Path.Combine(root, "electron.exe"),
        };
        foreach (var c in candidates)
        {
            if (File.Exists(c)) return c;
        }
        return null;
    }

    private static void TrySilent(string fileName, string args)
    {
        try
        {
            var p = Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = args,
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden,
            });
            if (p != null) p.WaitForExit(3000);
        }
        catch
        {
            /* ignore */
        }
    }
}