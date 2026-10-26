using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;

namespace OwnProfileEnhancerInstaller;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new InstallerForm());
    }
}

internal sealed class InstallerForm : Form
{
    private readonly string discordDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Discord");
    private readonly Label status = new();
    private readonly Button install = new() { Text = "Install" };
    private readonly Button uninstall = new() { Text = "Uninstall" };
    private readonly Button cancel = new() { Text = "Cancel", DialogResult = DialogResult.Cancel };

    public InstallerForm()
    {
        Text = "OwnProfileEnhancer Installer";
        ClientSize = new Size(600, 300);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        var title = new Label { Text = "OwnProfileEnhancer", Font = new Font(Font.FontFamily, 24), Location = new Point(24, 22), Size = new Size(550, 45), TextAlign = ContentAlignment.MiddleCenter };
        var notice = new Label { Text = "This installer includes a complete Vencord build with OwnProfileEnhancer. It preserves Discord and Vencord settings, but replaces the installed compiled Vencord payload.", Location = new Point(36, 88), Size = new Size(528, 55), BorderStyle = BorderStyle.FixedSingle, Padding = new Padding(10) };
        var heading = new Label { Text = "Discord installation to patch", Font = new Font(Font, FontStyle.Bold), Location = new Point(36, 162), Size = new Size(300, 25) };
        var path = new Label { Text = Directory.Exists(discordDirectory) ? discordDirectory : "Discord Stable was not detected.", Location = new Point(54, 191), Size = new Size(510, 25) };
        status.Location = new Point(36, 248);
        status.Size = new Size(190, 24);
        status.Text = Directory.Exists(discordDirectory) ? "Discord Stable detected." : "Install Discord Stable first.";

        cancel.Location = new Point(244, 244);
        cancel.Size = new Size(100, 30);
        cancel.Click += (_, _) => Close();

        uninstall.Location = new Point(354, 244);
        uninstall.Size = new Size(100, 30);
        uninstall.Enabled = Directory.Exists(discordDirectory);
        uninstall.Click += async (_, _) => await UninstallAsync();

        install.Location = new Point(464, 244);
        install.Size = new Size(100, 30);
        install.Enabled = Directory.Exists(discordDirectory);
        install.Click += async (_, _) => await InstallAsync();

        Controls.AddRange([title, notice, heading, path, status, cancel, uninstall, install]);
        CancelButton = cancel;
    }

    private async Task InstallAsync()
    {
        while (Process.GetProcessesByName("Discord").Length > 0)
        {
            if (MessageBox.Show(this, "Discord is running. Close Discord, then click Retry to continue.", "Restart Discord", MessageBoxButtons.RetryCancel, MessageBoxIcon.Warning) == DialogResult.Cancel) return;
        }
        install.Enabled = false;
        uninstall.Enabled = false;
        try
        {
            status.Text = "Preparing the included Vencord build...";
            await Task.Run(Inject);
            status.Text = "Installation complete. Starting Discord...";
            RestartDiscord();
            MessageBox.Show(this, "OwnProfileEnhancer was installed successfully. Discord has been restarted.", "Installation complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
            status.Text = "Installation complete.";
        }
        catch (Exception error)
        {
            MessageBox.Show(this, error.Message, "Installation failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            status.Text = "Installation failed.";
        }
        finally
        {
            install.Enabled = Directory.Exists(discordDirectory);
            uninstall.Enabled = Directory.Exists(discordDirectory);
        }
    }

    private async Task UninstallAsync()
    {
        while (Process.GetProcessesByName("Discord").Length > 0)
        {
            if (MessageBox.Show(this, "Discord is running. Close Discord, then click Retry to continue.", "Restart Discord", MessageBoxButtons.RetryCancel, MessageBoxIcon.Warning) == DialogResult.Cancel) return;
        }
        install.Enabled = false;
        uninstall.Enabled = false;
        try
        {
            status.Text = "Removing OwnProfileEnhancer...";
            var restoredStandardVencord = await Task.Run(Uninject);
            status.Text = "Starting Discord...";
            RestartDiscord();
            var message = restoredStandardVencord
                ? "OwnProfileEnhancer was removed and standard Vencord was restored. Discord has been restarted."
                : "OwnProfileEnhancer was uninstalled successfully. Discord has been restarted.";
            MessageBox.Show(this, message, "Uninstallation complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
            status.Text = "Uninstallation complete.";
        }
        catch (Exception error)
        {
            MessageBox.Show(this, error.Message, "Uninstallation failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            status.Text = "Uninstallation failed.";
        }
        finally
        {
            install.Enabled = Directory.Exists(discordDirectory);
            uninstall.Enabled = Directory.Exists(discordDirectory);
        }
    }

    private void RestartDiscord()
    {
        var discordExe = Path.Combine(discordDirectory, "Discord.exe");
        var update = Path.Combine(discordDirectory, "Update.exe");
        if (File.Exists(discordExe))
        {
            Process.Start(new ProcessStartInfo(discordExe) { UseShellExecute = true, WorkingDirectory = discordDirectory });
        }
        else if (File.Exists(update))
        {
            Process.Start(new ProcessStartInfo(update, "--processStart Discord.exe") { UseShellExecute = true, WorkingDirectory = discordDirectory });
        }
    }

    private void Inject()
    {
        var ownProfileEnhancerDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "OwnProfileEnhancer");
        var distDirectory = Path.Combine(ownProfileEnhancerDir, "dist");
        Directory.CreateDirectory(distDirectory);

        var tempCliDirectory = Path.Combine(Path.GetTempPath(), "OwnProfileEnhancerInstaller", Guid.NewGuid().ToString("N"));
        try
        {
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("OwnProfileEnhancer.VencordBuild.zip") ?? throw new InvalidOperationException("The included Vencord build is missing.");
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read);

            string? cli = null;

            foreach (var entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.Name)) continue;

                var normalizedFullName = entry.FullName.Replace('\\', '/');
                if (normalizedFullName.StartsWith("Installer/", StringComparison.OrdinalIgnoreCase) || entry.Name.Equals("VencordInstallerCli.exe", StringComparison.OrdinalIgnoreCase))
                {
                    Directory.CreateDirectory(tempCliDirectory);
                    var targetPath = Path.Combine(tempCliDirectory, entry.Name);
                    entry.ExtractToFile(targetPath, overwrite: true);
                    if (entry.Name.Equals("VencordInstallerCli.exe", StringComparison.OrdinalIgnoreCase))
                    {
                        cli = targetPath;
                    }
                }
                else
                {
                    var targetPath = Path.Combine(distDirectory, entry.Name);
                    entry.ExtractToFile(targetPath, overwrite: true);
                }
            }

            if (cli == null || !File.Exists(cli)) throw new InvalidOperationException("The included Vencord installer is missing.");

            var packageJson = Path.Combine(distDirectory, "package.json");
            if (!File.Exists(packageJson)) File.WriteAllText(packageJson, "{}");

            using var process = new Process
            {
                StartInfo = new ProcessStartInfo(cli, "-install -branch stable")
                {
                    WorkingDirectory = tempCliDirectory,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardError = true,
                    RedirectStandardOutput = true
                }
            };
            process.StartInfo.Environment["VENCORD_USER_DATA_DIR"] = ownProfileEnhancerDir;
            process.StartInfo.Environment["VENCORD_DEV_INSTALL"] = "1";
            var output = RunInstaller(process);
            if (process.ExitCode != 0) throw new InvalidOperationException($"Vencord installation failed.\n\n{output}");
        }
        finally { if (Directory.Exists(tempCliDirectory)) Directory.Delete(tempCliDirectory, recursive: true); }
    }

    private bool Uninject()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var standardVencordDir = Path.Combine(appData, "Vencord");
        var standardPatcher = Path.Combine(standardVencordDir, "dist", "patcher.js");
        var hasStandardVencord = File.Exists(standardPatcher);

        var tempCliDirectory = Path.Combine(Path.GetTempPath(), "OwnProfileEnhancerInstaller", Guid.NewGuid().ToString("N"));
        try
        {
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("OwnProfileEnhancer.VencordBuild.zip") ?? throw new InvalidOperationException("The included Vencord build is missing.");
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read);

            string? cli = null;

            foreach (var entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.Name)) continue;

                var normalizedFullName = entry.FullName.Replace('\\', '/');
                if (normalizedFullName.StartsWith("Installer/", StringComparison.OrdinalIgnoreCase) || entry.Name.Equals("VencordInstallerCli.exe", StringComparison.OrdinalIgnoreCase))
                {
                    Directory.CreateDirectory(tempCliDirectory);
                    var targetPath = Path.Combine(tempCliDirectory, entry.Name);
                    entry.ExtractToFile(targetPath, overwrite: true);
                    if (entry.Name.Equals("VencordInstallerCli.exe", StringComparison.OrdinalIgnoreCase))
                    {
                        cli = targetPath;
                    }
                }
            }

            if (cli == null || !File.Exists(cli)) throw new InvalidOperationException("The included Vencord installer is missing.");

            if (hasStandardVencord)
            {
                using var process = new Process
                {
                    StartInfo = new ProcessStartInfo(cli, "-install -branch stable")
                    {
                        WorkingDirectory = tempCliDirectory,
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardError = true,
                        RedirectStandardOutput = true
                    }
                };
                process.StartInfo.Environment["VENCORD_USER_DATA_DIR"] = standardVencordDir;
                process.StartInfo.Environment["VENCORD_DEV_INSTALL"] = "1";
                var output = RunInstaller(process);
                if (process.ExitCode != 0) throw new InvalidOperationException($"Failed to restore standard Vencord.\n\n{output}");
            }
            else
            {
                using var process = new Process
                {
                    StartInfo = new ProcessStartInfo(cli, "-uninstall -branch stable")
                    {
                        WorkingDirectory = tempCliDirectory,
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardError = true,
                        RedirectStandardOutput = true
                    }
                };
                var output = RunInstaller(process);
                if (process.ExitCode != 0) throw new InvalidOperationException($"Uninstallation failed.\n\n{output}");
            }

            var ownProfileEnhancerDir = Path.Combine(appData, "OwnProfileEnhancer");
            if (Directory.Exists(ownProfileEnhancerDir))
            {
                try { Directory.Delete(ownProfileEnhancerDir, recursive: true); } catch { /* best effort */ }
            }

            return hasStandardVencord;
        }
        finally { if (Directory.Exists(tempCliDirectory)) Directory.Delete(tempCliDirectory, recursive: true); }
    }

    private static string RunInstaller(Process process)
    {
        process.Start();
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();
        process.WaitForExit();
        Task.WaitAll(standardOutput, standardError);
        return standardOutput.Result + standardError.Result;
    }
}
