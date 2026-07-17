using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("REEBOT LAB Updater")]
[assembly: AssemblyDescription("Actualizador incremental de REEBOT LAB")]
[assembly: AssemblyCompany("REEBOT LAB")]
[assembly: AssemblyProduct("REEBOT LAB")]
[assembly: AssemblyCopyright("REEBOT LAB Early Access")]
[assembly: AssemblyVersion("0.6.0.0")]
[assembly: AssemblyFileVersion("0.6.0.0")]

namespace ReebotLab.Updater
{
    internal sealed class ReleaseAsset
    {
        public string Name;
        public string DownloadUrl;
        public string Digest;
        public long Size;
        public bool IsDelta;
    }

    internal sealed class AvailableUpdate
    {
        public string CurrentVersion;
        public string TargetVersion;
        public string InstallRoot;
        public ReleaseAsset Asset;
    }

    internal static class UpdateClient
    {
        private const string ReleasesApi = "https://api.github.com/repos/estebannlhrnaud-droid/Reebot-Lab/releases?per_page=20";

        public static AvailableUpdate Check()
        {
            string installRoot;
            string current = ReadInstalledVersion(out installRoot);
            if (current == null) throw new InvalidOperationException("No encontré una instalación de REEBOT LAB en Archivos de programa.");

            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(ReleasesApi);
            request.UserAgent = "REEBOT-LAB-Updater/0.6.0";
            request.Accept = "application/vnd.github+json";
            request.Headers["X-GitHub-Api-Version"] = "2022-11-28";
            string json;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                json = reader.ReadToEnd();
            }

            JavaScriptSerializer serializer = new JavaScriptSerializer();
            object[] releases = serializer.DeserializeObject(json) as object[];
            if (releases == null) throw new InvalidOperationException("GitHub devolvió una respuesta inesperada.");

            Version currentVersion;
            if (!Version.TryParse(current, out currentVersion)) throw new InvalidOperationException("La versión instalada no es válida.");
            Dictionary<string, object> bestRelease = null;
            Version bestVersion = currentVersion;

            foreach (object value in releases)
            {
                Dictionary<string, object> release = value as Dictionary<string, object>;
                if (release == null || ReadBool(release, "draft")) continue;
                string tag = ReadString(release, "tag_name");
                Version candidate;
                if (tag == null || !Version.TryParse(tag.TrimStart('v', 'V'), out candidate)) continue;
                if (candidate.CompareTo(bestVersion) > 0)
                {
                    bestVersion = candidate;
                    bestRelease = release;
                }
            }
            if (bestRelease == null) return null;

            string target = bestVersion.ToString(3);
            string deltaName = string.Format("REEBOT-LAB-update-v{0}-to-v{1}.zip", current, target);
            string fullName = string.Format("REEBOT-LAB-v{0}-windows.zip", target);
            ReleaseAsset delta = null;
            ReleaseAsset full = null;
            object[] assets = bestRelease.ContainsKey("assets") ? bestRelease["assets"] as object[] : null;
            if (assets != null)
            {
                foreach (object assetValue in assets)
                {
                    Dictionary<string, object> asset = assetValue as Dictionary<string, object>;
                    if (asset == null) continue;
                    string name = ReadString(asset, "name");
                    if (name == deltaName) delta = ReadAsset(asset, true);
                    if (name == fullName) full = ReadAsset(asset, false);
                }
            }
            ReleaseAsset selected = delta ?? full;
            if (selected == null) throw new InvalidOperationException("La nueva release todavía no tiene un paquete compatible.");
            if (string.IsNullOrEmpty(selected.Digest) || !selected.Digest.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("La actualización no incluye un hash SHA-256 verificable.");
            }
            return new AvailableUpdate { CurrentVersion = current, TargetVersion = target, InstallRoot = installRoot, Asset = selected };
        }

        private static ReleaseAsset ReadAsset(Dictionary<string, object> value, bool isDelta)
        {
            long size = 0;
            object rawSize;
            if (value.TryGetValue("size", out rawSize) && rawSize != null) long.TryParse(rawSize.ToString(), out size);
            return new ReleaseAsset
            {
                Name = ReadString(value, "name"),
                DownloadUrl = ReadString(value, "browser_download_url"),
                Digest = ReadString(value, "digest"),
                Size = size,
                IsDelta = isDelta
            };
        }

        private static string ReadInstalledVersion(out string installRoot)
        {
            installRoot = null;
            string installBase = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "REEBOT LAB");
            string statePath = Path.Combine(installBase, "install.json");
            if (File.Exists(statePath))
            {
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                Dictionary<string, object> state = serializer.DeserializeObject(File.ReadAllText(statePath)) as Dictionary<string, object>;
                string version = state == null ? null : ReadString(state, "version");
                string root = state == null ? null : ReadString(state, "installRoot");
                if (version != null && root != null && Directory.Exists(root))
                {
                    installRoot = root;
                    return version;
                }
            }
            if (!Directory.Exists(installBase)) return null;
            Version best = null;
            string bestRoot = null;
            foreach (string directory in Directory.GetDirectories(installBase, "app-*"))
            {
                Version candidate;
                string name = Path.GetFileName(directory).Substring(4);
                if (Version.TryParse(name, out candidate) && (best == null || candidate.CompareTo(best) > 0))
                {
                    best = candidate;
                    bestRoot = directory;
                }
            }
            if (best == null) return null;
            installRoot = bestRoot;
            return best.ToString(3);
        }

        private static bool ReadBool(Dictionary<string, object> value, string key)
        {
            object raw;
            return value.TryGetValue(key, out raw) && raw is bool && (bool)raw;
        }

        private static string ReadString(Dictionary<string, object> value, string key)
        {
            object raw;
            return value.TryGetValue(key, out raw) && raw != null ? raw.ToString() : null;
        }
    }

    internal sealed class UpdateForm : Form
    {
        private readonly bool silent;
        private readonly Label titleLabel;
        private readonly Label detailLabel;
        private readonly ProgressBar progress;
        private readonly Button actionButton;
        private AvailableUpdate available;

        public UpdateForm(bool silentMode)
        {
            silent = silentMode;
            Text = "REEBOT LAB Updater";
            ClientSize = new Size(620, 330);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            BackColor = Color.FromArgb(8, 8, 12);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            Label brand = MakeLabel("REEBOT  LAB", 34, 28, 540, 44, 23, FontStyle.Bold, Color.White);
            Controls.Add(brand);
            Controls.Add(MakeLabel("UPDATE CHANNEL / EARLY ACCESS", 36, 74, 520, 22, 8, FontStyle.Bold, Color.FromArgb(137, 91, 255)));

            titleLabel = MakeLabel("BUSCANDO ACTUALIZACIONES...", 36, 128, 548, 36, 14, FontStyle.Bold, Color.White);
            Controls.Add(titleLabel);
            detailLabel = MakeLabel("Consultando el canal oficial de REEBOT LAB.", 36, 170, 548, 52, 9, FontStyle.Regular, Color.FromArgb(170, 170, 184));
            Controls.Add(detailLabel);

            progress = new ProgressBar();
            progress.Location = new Point(36, 232);
            progress.Size = new Size(548, 8);
            progress.Style = ProgressBarStyle.Marquee;
            Controls.Add(progress);

            actionButton = new Button();
            actionButton.Text = "ESPERA...";
            actionButton.Location = new Point(386, 264);
            actionButton.Size = new Size(198, 42);
            actionButton.FlatStyle = FlatStyle.Flat;
            actionButton.FlatAppearance.BorderColor = Color.FromArgb(137, 91, 255);
            actionButton.BackColor = Color.FromArgb(137, 91, 255);
            actionButton.ForeColor = Color.Black;
            actionButton.Font = new Font("Segoe UI", 8, FontStyle.Bold);
            actionButton.Enabled = false;
            actionButton.Click += async delegate { await DownloadAndInstall(); };
            Controls.Add(actionButton);

            Shown += async delegate { await CheckForUpdates(); };
        }

        private static Label MakeLabel(string text, int x, int y, int width, int height, float size, FontStyle style, Color color)
        {
            Label label = new Label();
            label.Text = text;
            label.Location = new Point(x, y);
            label.Size = new Size(width, height);
            label.Font = new Font("Segoe UI", size, style);
            label.ForeColor = color;
            label.BackColor = Color.Transparent;
            return label;
        }

        private async Task CheckForUpdates()
        {
            try
            {
                available = await Task.Run(new Func<AvailableUpdate>(UpdateClient.Check));
                if (available == null)
                {
                    if (silent) { Close(); return; }
                    titleLabel.Text = "REEBOT ESTÁ ACTUALIZADO";
                    detailLabel.Text = "No hay una versión más reciente en el canal Early Access.";
                    progress.Style = ProgressBarStyle.Continuous;
                    progress.Value = 100;
                    actionButton.Text = "CERRAR";
                    actionButton.Enabled = true;
                    actionButton.Click -= async delegate { await DownloadAndInstall(); };
                    actionButton.Click += delegate { Close(); };
                    return;
                }
                titleLabel.Text = string.Format("ACTUALIZACIÓN {0} DISPONIBLE", available.TargetVersion);
                detailLabel.Text = string.Format(
                    "Versión instalada: {0}. Se descargará {1} ({2:0.0} MB) y se conservará la versión anterior como respaldo.",
                    available.CurrentVersion,
                    available.Asset.IsDelta ? "un parche incremental" : "el paquete completo",
                    available.Asset.Size / 1024d / 1024d
                );
                progress.Style = ProgressBarStyle.Continuous;
                progress.Value = 0;
                actionButton.Text = "ACTUALIZAR";
                actionButton.Enabled = true;
            }
            catch (Exception exception)
            {
                if (silent) { Close(); return; }
                titleLabel.Text = "NO PUDE COMPROBAR";
                detailLabel.Text = exception.Message;
                progress.Style = ProgressBarStyle.Continuous;
                actionButton.Text = "CERRAR";
                actionButton.Enabled = true;
                actionButton.Click += delegate { Close(); };
            }
        }

        private async Task DownloadAndInstall()
        {
            if (available == null) { Close(); return; }
            actionButton.Enabled = false;
            titleLabel.Text = "DESCARGANDO ACTUALIZACIÓN...";
            string updateDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "REEBOT LAB", "updates");
            Directory.CreateDirectory(updateDirectory);
            string downloadPath = Path.Combine(updateDirectory, available.Asset.Name);
            try
            {
                using (WebClient client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.UserAgent] = "REEBOT-LAB-Updater/0.6.0";
                    client.DownloadProgressChanged += delegate(object sender, DownloadProgressChangedEventArgs eventArgs)
                    {
                        progress.Value = Math.Max(0, Math.Min(100, eventArgs.ProgressPercentage));
                        detailLabel.Text = string.Format("Descargando {0:0.0} de {1:0.0} MB.", eventArgs.BytesReceived / 1024d / 1024d, eventArgs.TotalBytesToReceive / 1024d / 1024d);
                    };
                    await client.DownloadFileTaskAsync(new Uri(available.Asset.DownloadUrl), downloadPath);
                }
                titleLabel.Text = "VERIFICANDO PAQUETE...";
                string actualHash = ComputeSha256(downloadPath);
                string expectedHash = available.Asset.Digest.Substring("sha256:".Length);
                if (!string.Equals(actualHash, expectedHash, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("El hash SHA-256 no coincide. El paquete no se aplicará.");

                string staging = Path.Combine(updateDirectory, "staging-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(staging);
                ZipFile.ExtractToDirectory(downloadPath, staging);
                titleLabel.Text = "APLICANDO ACTUALIZACIÓN...";
                detailLabel.Text = "Windows pedirá permiso para actualizar Archivos de programa.";
                int exitCode = await Task.Run(new Func<int>(delegate { return ApplyPackage(staging); }));
                if (exitCode != 0) throw new InvalidOperationException("El instalador terminó con código " + exitCode + ".");

                string launcher = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "REEBOT LAB", "app-" + available.TargetVersion, "REEBOT LAB.exe");
                if (!File.Exists(launcher)) throw new FileNotFoundException("No se encontró el launcher actualizado.", launcher);
                ProcessStartInfo launch = new ProcessStartInfo(launcher, "--installed-launch");
                launch.WorkingDirectory = Path.GetDirectoryName(launcher);
                launch.UseShellExecute = true;
                Process.Start(launch);
                Close();
            }
            catch (Exception exception)
            {
                titleLabel.Text = "ACTUALIZACIÓN CANCELADA";
                detailLabel.Text = exception.Message + " La versión instalada no fue reemplazada.";
                actionButton.Text = "CERRAR";
                actionButton.Enabled = true;
                actionButton.Click += delegate { Close(); };
            }
        }

        private int ApplyPackage(string staging)
        {
            string script;
            string arguments;
            if (available.Asset.IsDelta)
            {
                string[] scripts = Directory.GetFiles(staging, "apply-update.ps1", SearchOption.AllDirectories);
                if (scripts.Length == 0) throw new FileNotFoundException("El parche no contiene apply-update.ps1.");
                script = scripts[0];
                string patchRoot = Path.Combine(Path.GetDirectoryName(script), "files");
                if (!Directory.Exists(patchRoot)) throw new DirectoryNotFoundException("El parche no contiene la carpeta files.");
                arguments = string.Format(
                    "-NoProfile -ExecutionPolicy Bypass -File \"{0}\" -BaseVersion \"{1}\" -TargetVersion \"{2}\" -PatchRoot \"{3}\"",
                    script, available.CurrentVersion, available.TargetVersion, patchRoot
                );
            }
            else
            {
                string[] scripts = Directory.GetFiles(staging, "install-reebot.ps1", SearchOption.AllDirectories);
                if (scripts.Length == 0) throw new FileNotFoundException("El paquete no contiene install-reebot.ps1.");
                script = scripts[0];
                string sourceRoot = Path.GetDirectoryName(script);
                arguments = string.Format("-NoProfile -ExecutionPolicy Bypass -File \"{0}\" -SourceRoot \"{1}\" -Version \"{2}\"", script, sourceRoot, available.TargetVersion);
            }
            ProcessStartInfo info = new ProcessStartInfo("powershell.exe", arguments);
            info.UseShellExecute = true;
            info.Verb = "runas";
            info.WindowStyle = ProcessWindowStyle.Normal;
            using (Process process = Process.Start(info))
            {
                process.WaitForExit();
                return process.ExitCode;
            }
        }

        private static string ComputeSha256(string path)
        {
            using (SHA256 algorithm = SHA256.Create())
            using (FileStream stream = File.OpenRead(path))
            {
                byte[] hash = algorithm.ComputeHash(stream);
                return BitConverter.ToString(hash).Replace("-", string.Empty).ToLowerInvariant();
            }
        }
    }

    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            if (args != null && args.Length > 0 && string.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase))
            {
                return typeof(UpdateClient) != null && typeof(UpdateForm) != null ? 0 : 2;
            }
            bool silent = args != null && Array.Exists(args, delegate(string value) { return string.Equals(value, "--check-silent", StringComparison.OrdinalIgnoreCase); });
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new UpdateForm(silent));
            return 0;
        }
    }
}
