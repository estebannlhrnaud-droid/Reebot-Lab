using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Windows.Forms;

[assembly: AssemblyTitle("REEBOT LAB Launcher")]
[assembly: AssemblyDescription("Launcher local de REEBOT LAB")]
[assembly: AssemblyCompany("REEBOT LAB")]
[assembly: AssemblyProduct("REEBOT LAB")]
[assembly: AssemblyCopyright("REEBOT LAB Early Access")]
[assembly: AssemblyVersion("0.3.0.0")]
[assembly: AssemblyFileVersion("0.3.0.0")]

namespace ReebotLab.Launcher
{
    internal sealed class RoundedPanel : Panel
    {
        public int CornerRadius { get; set; }
        public Color BorderColor { get; set; }
        public int BorderWidth { get; set; }

        public RoundedPanel()
        {
            CornerRadius = 18;
            BorderColor = Color.Transparent;
            BorderWidth = 1;
            DoubleBuffered = true;
        }

        private GraphicsPath BuildPath(Rectangle bounds)
        {
            int diameter = Math.Max(2, CornerRadius * 2);
            GraphicsPath path = new GraphicsPath();
            path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
            path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
            path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }

        protected override void OnResize(EventArgs eventArgs)
        {
            base.OnResize(eventArgs);
            if (Width < 2 || Height < 2) return;
            using (GraphicsPath path = BuildPath(new Rectangle(0, 0, Width, Height)))
            {
                Region = new Region(path);
            }
        }

        protected override void OnPaint(PaintEventArgs eventArgs)
        {
            eventArgs.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (GraphicsPath path = BuildPath(new Rectangle(1, 1, Width - 3, Height - 3)))
            using (SolidBrush brush = new SolidBrush(BackColor))
            {
                eventArgs.Graphics.FillPath(brush, path);
                if (BorderColor != Color.Transparent && BorderWidth > 0)
                {
                    using (Pen pen = new Pen(BorderColor, BorderWidth))
                    {
                        eventArgs.Graphics.DrawPath(pen, path);
                    }
                }
            }
        }
    }

    internal sealed class RoundedButton : Button
    {
        public int CornerRadius { get; set; }

        public RoundedButton()
        {
            CornerRadius = 13;
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            Cursor = Cursors.Hand;
        }

        protected override void OnResize(EventArgs eventArgs)
        {
            base.OnResize(eventArgs);
            if (Width < 2 || Height < 2) return;
            int diameter = CornerRadius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(0, 0, diameter, diameter, 180, 90);
            path.AddArc(Width - diameter, 0, diameter, diameter, 270, 90);
            path.AddArc(Width - diameter, Height - diameter, diameter, diameter, 0, 90);
            path.AddArc(0, Height - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            Region = new Region(path);
            path.Dispose();
        }
    }

    internal sealed class StatusCard
    {
        public RoundedPanel Panel;
        public Label Value;
        public Panel Accent;
    }

    internal sealed class OllamaState
    {
        public bool Ready;
        public string Label;
    }

    internal sealed class LauncherForm : Form
    {
        private const string LauncherVersion = "0.3.0";
        private const string PublishedUrl = "https://reebot-lab-preview.estebannlhrnaud.chatgpt.site";
        private const string LocalUrl = "http://localhost:3000";
        private const int BridgePort = 47831;

        private readonly string projectRoot;
        private string nodePath;
        private string npmPath;
        private string ollamaPath;
        private bool openWhenReady;
        private bool openedLocal;
        private bool actionInProgress;

        private StatusCard nodeCard;
        private StatusCard agentCard;
        private StatusCard aiCard;
        private Label pairCodeLabel;
        private RoundedButton copyCodeButton;
        private RoundedButton localButton;
        private Label activityLabel;
        private Timer statusTimer;

        private readonly Color ink = Color.FromArgb(7, 7, 10);
        private readonly Color violet = Color.FromArgb(137, 91, 255);
        private readonly Color cyan = Color.FromArgb(70, 220, 255);
        private readonly Color mint = Color.FromArgb(98, 255, 197);
        private readonly Color soft = Color.FromArgb(244, 244, 247);

        private string LauncherLogPath
        {
            get { return Path.Combine(projectRoot, ".reebot-launcher.log"); }
        }

        public LauncherForm()
        {
            projectRoot = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            BuildInterface();
            RefreshExecutablePaths();
            RefreshSystemStatus();
            statusTimer.Start();
        }

        private Font UiFont(float size, FontStyle style)
        {
            return new Font("Segoe UI", size, style, GraphicsUnit.Point);
        }

        private Label MakeLabel(string text, int x, int y, int width, int height, float size, FontStyle style, Color color)
        {
            Label label = new Label();
            label.Text = text;
            label.Location = new Point(x, y);
            label.Size = new Size(width, height);
            label.Font = UiFont(size, style);
            label.ForeColor = color;
            label.BackColor = Color.Transparent;
            return label;
        }

        private void BuildInterface()
        {
            Text = "REEBOT LAB Launcher";
            ClientSize = new Size(920, 625);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            BackColor = Color.White;
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);

            Panel header = new Panel();
            header.Location = new Point(0, 0);
            header.Size = new Size(920, 188);
            header.BackColor = ink;
            Controls.Add(header);

            Label eyebrow = MakeLabel("PERSONAL COMPUTER COMPANION  /  WINDOWS", 42, 28, 540, 20, 8, FontStyle.Bold, Color.FromArgb(165, 165, 175));
            header.Controls.Add(eyebrow);
            Label title = MakeLabel("REEBOT  LAB", 38, 50, 570, 62, 31, FontStyle.Bold, Color.White);
            header.Controls.Add(title);
            Label subtitle = MakeLabel("TU PC, POR FIN ENTENDIBLE.", 42, 116, 500, 28, 10, FontStyle.Bold, Color.FromArgb(194, 178, 255));
            header.Controls.Add(subtitle);
            Label version = MakeLabel("EARLY ACCESS  /  V" + LauncherVersion, 42, 148, 380, 22, 8, FontStyle.Bold, cyan);
            header.Controls.Add(version);

            PictureBox mascot = new PictureBox();
            mascot.Location = new Point(710, 6);
            mascot.Size = new Size(176, 176);
            mascot.SizeMode = PictureBoxSizeMode.Zoom;
            mascot.BackColor = Color.Transparent;
            string mascotPath = Path.Combine(projectRoot, "public", "reebot-mascot.png");
            if (File.Exists(mascotPath))
            {
                using (Image original = Image.FromFile(mascotPath))
                {
                    mascot.Image = new Bitmap(original);
                }
            }
            header.Controls.Add(mascot);

            Controls.Add(MakeLabel("ESTADO DEL SISTEMA", 42, 204, 280, 20, 8, FontStyle.Bold, Color.FromArgb(98, 98, 108)));
            nodeCard = CreateStatusCard("01  /  NODE.JS", 42, 230, violet);
            agentCard = CreateStatusCard("02  /  AGENTE LOCAL", 326, 230, cyan);
            aiCard = CreateStatusCard("03  /  IA + OLLAMA", 610, 230, mint);

            RoundedPanel pairing = new RoundedPanel();
            pairing.Location = new Point(42, 354);
            pairing.Size = new Size(836, 104);
            pairing.CornerRadius = 18;
            pairing.BackColor = ink;
            pairing.BorderColor = Color.FromArgb(55, 55, 67);
            pairing.BorderWidth = 1;
            Controls.Add(pairing);
            pairing.Controls.Add(MakeLabel("VINCULACION SEGURA  /  VERSION WEB", 22, 17, 420, 20, 8, FontStyle.Bold, Color.FromArgb(155, 155, 166)));
            pairCodeLabel = MakeLabel("SIN CODIGO", 21, 45, 280, 40, 17, FontStyle.Bold, Color.White);
            pairing.Controls.Add(pairCodeLabel);
            pairing.Controls.Add(MakeLabel("CODIGO TEMPORAL", 295, 52, 180, 24, 8, FontStyle.Bold, violet));

            copyCodeButton = MakeButton("INICIAR AGENTE", 638, 29, 170, 48, ink, Color.White, violet);
            copyCodeButton.Click += delegate
            {
                if (Regex.IsMatch(pairCodeLabel.Text, "^\\d{6}$"))
                {
                    Clipboard.SetText(pairCodeLabel.Text);
                    copyCodeButton.Text = "COPIADO";
                }
                else
                {
                    StartBridge();
                    activityLabel.Text = "INICIANDO AGENTE LOCAL...";
                    activityLabel.ForeColor = violet;
                }
            };
            pairing.Controls.Add(copyCodeButton);

            localButton = MakeButton("INICIAR EN LOCAL", 42, 486, 407, 58, ink, Color.White, ink);
            localButton.Click += delegate
            {
                if (TestWebReady(LocalUrl)) OpenUrl(LocalUrl);
                else StartLocal();
            };
            Controls.Add(localButton);

            RoundedButton webButton = MakeButton("ABRIR VERSION WEB", 471, 486, 407, 58, soft, ink, soft);
            webButton.Click += delegate { StartPublished(); };
            Controls.Add(webButton);

            activityLabel = MakeLabel("COMPROBANDO TU PC...", 42, 570, 560, 28, 8, FontStyle.Bold, Color.FromArgb(98, 98, 108));
            Controls.Add(activityLabel);

            LinkLabel consoleLink = new LinkLabel();
            consoleLink.Text = "CONSOLA IA";
            consoleLink.Location = new Point(596, 570);
            consoleLink.Size = new Size(112, 28);
            consoleLink.TextAlign = ContentAlignment.MiddleRight;
            consoleLink.Font = UiFont(8, FontStyle.Bold);
            consoleLink.LinkColor = cyan;
            consoleLink.LinkClicked += delegate { OpenAiConsole(); };
            Controls.Add(consoleLink);

            LinkLabel ollamaLink = new LinkLabel();
            ollamaLink.Text = "INSTALAR OLLAMA";
            ollamaLink.Location = new Point(724, 570);
            ollamaLink.Size = new Size(154, 28);
            ollamaLink.TextAlign = ContentAlignment.MiddleRight;
            ollamaLink.Font = UiFont(8, FontStyle.Bold);
            ollamaLink.LinkColor = violet;
            ollamaLink.LinkClicked += delegate { OpenUrl("https://ollama.com/download/windows"); };
            Controls.Add(ollamaLink);

            statusTimer = new Timer();
            statusTimer.Interval = 1600;
            statusTimer.Tick += delegate { if (!actionInProgress) RefreshSystemStatus(); };
            FormClosed += delegate
            {
                statusTimer.Stop();
                statusTimer.Dispose();
                if (mascot.Image != null) mascot.Image.Dispose();
            };
        }

        private void OpenAiConsole()
        {
            string consolePath = Path.Combine(projectRoot, "OPEN_REEBOT_AI.cmd");
            if (!File.Exists(consolePath))
            {
                MessageBox.Show("No encontre OPEN_REEBOT_AI.cmd junto al launcher.", "REEBOT LAB", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(consolePath);
                info.WorkingDirectory = projectRoot;
                info.UseShellExecute = true;
                Process.Start(info);
            }
            catch (Exception exception)
            {
                MessageBox.Show("No pude abrir la consola de IA.\r\n\r\n" + exception.Message, "REEBOT LAB", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private StatusCard CreateStatusCard(string caption, int x, int y, Color accentColor)
        {
            RoundedPanel panel = new RoundedPanel();
            panel.Location = new Point(x, y);
            panel.Size = new Size(268, 100);
            panel.CornerRadius = 16;
            panel.BackColor = ink;
            panel.BorderColor = Color.FromArgb(35, 35, 42);
            panel.BorderWidth = 1;

            Panel accent = new Panel();
            accent.Location = new Point(18, 15);
            accent.Size = new Size(32, 3);
            accent.BackColor = accentColor;
            panel.Controls.Add(accent);
            panel.Controls.Add(MakeLabel(caption, 18, 27, 230, 20, 8, FontStyle.Bold, Color.FromArgb(150, 150, 162)));
            Label value = MakeLabel("COMPROBANDO", 18, 54, 232, 30, 14, FontStyle.Bold, Color.White);
            panel.Controls.Add(value);
            Controls.Add(panel);
            return new StatusCard { Panel = panel, Value = value, Accent = accent };
        }

        private RoundedButton MakeButton(string text, int x, int y, int width, int height, Color background, Color foreground, Color border)
        {
            RoundedButton button = new RoundedButton();
            button.Text = text;
            button.Location = new Point(x, y);
            button.Size = new Size(width, height);
            button.BackColor = background;
            button.ForeColor = foreground;
            button.Font = UiFont(9, FontStyle.Bold);
            button.FlatAppearance.BorderColor = border;
            return button;
        }

        private void SetCard(StatusCard card, string value, bool ready, Color readyColor)
        {
            card.Value.Text = value;
            card.Value.ForeColor = ready ? Color.White : violet;
            card.Accent.BackColor = ready ? readyColor : Color.FromArgb(90, 90, 103);
        }

        private string FindExecutable(string name, params string[] fallbacks)
        {
            string pathValue = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
            string[] directories = pathValue.Split(Path.PathSeparator);
            for (int index = 0; index < directories.Length; index++)
            {
                string directory = directories[index].Trim().Trim('"');
                if (directory.Length == 0) continue;
                string candidate = Path.Combine(directory, name);
                if (File.Exists(candidate)) return candidate;
            }
            for (int index = 0; index < fallbacks.Length; index++)
            {
                if (!string.IsNullOrEmpty(fallbacks[index]) && File.Exists(fallbacks[index])) return fallbacks[index];
            }
            return null;
        }

        private void RefreshExecutablePaths()
        {
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            nodePath = FindExecutable(
                "node.exe",
                Path.Combine(programFiles, "nodejs", "node.exe"),
                Path.Combine(localData, "Programs", "nodejs", "node.exe")
            );
            npmPath = nodePath == null ? null : Path.Combine(Path.GetDirectoryName(nodePath), "npm.cmd");
            if (npmPath != null && !File.Exists(npmPath)) npmPath = FindExecutable("npm.cmd");
            if (nodePath != null)
            {
                string nodeDirectory = Path.GetDirectoryName(nodePath);
                string processPath = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
                bool alreadyPresent = false;
                string[] pathEntries = processPath.Split(Path.PathSeparator);
                for (int index = 0; index < pathEntries.Length; index++)
                {
                    if (string.Equals(pathEntries[index].Trim().Trim('"'), nodeDirectory, StringComparison.OrdinalIgnoreCase))
                    {
                        alreadyPresent = true;
                        break;
                    }
                }
                if (!alreadyPresent)
                {
                    Environment.SetEnvironmentVariable("PATH", nodeDirectory + Path.PathSeparator + processPath, EnvironmentVariableTarget.Process);
                }
            }
            ollamaPath = FindExecutable(
                "ollama.exe",
                Path.Combine(localData, "Programs", "Ollama", "ollama.exe"),
                Path.Combine(programFiles, "Ollama", "ollama.exe")
            );
        }

        private string CaptureOutput(string executable, string arguments)
        {
            if (string.IsNullOrEmpty(executable)) return null;
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(executable, arguments);
                info.UseShellExecute = false;
                info.RedirectStandardOutput = true;
                info.RedirectStandardError = true;
                info.CreateNoWindow = true;
                using (Process process = Process.Start(info))
                {
                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit(3000);
                    return output.Trim();
                }
            }
            catch { return null; }
        }

        private Version GetNodeVersion()
        {
            string raw = CaptureOutput(nodePath, "--version");
            if (string.IsNullOrEmpty(raw)) return null;
            Version parsed;
            if (Version.TryParse(raw.Trim().TrimStart('v'), out parsed)) return parsed;
            return null;
        }

        private bool TestTcp(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult result = client.BeginConnect("127.0.0.1", port, null, null);
                    bool ready = result.AsyncWaitHandle.WaitOne(400);
                    if (!ready) return false;
                    client.EndConnect(result);
                    return client.Connected;
                }
            }
            catch { return false; }
        }

        private string GetHttp(string url, string origin)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = "GET";
                request.Timeout = 1200;
                request.ReadWriteTimeout = 1200;
                if (!string.IsNullOrEmpty(origin)) request.Headers["Origin"] = origin;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    return reader.ReadToEnd();
                }
            }
            catch { return null; }
        }

        private bool TestWebReady(string url)
        {
            return GetHttp(url, null) != null;
        }

        private OllamaState GetOllamaState()
        {
            string json = GetHttp("http://127.0.0.1:11434/api/tags", null);
            if (json == null)
            {
                return new OllamaState { Ready = false, Label = ollamaPath == null ? "NO INSTALADA" : "DETENIDA" };
            }
            MatchCollection matches = Regex.Matches(json, "\\\"(?:name|model)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
            string first = null;
            for (int index = 0; index < matches.Count; index++)
            {
                string model = matches[index].Groups[1].Value;
                if (model.IndexOf("qwen3.5:9b", StringComparison.OrdinalIgnoreCase) >= 0)
                    return new OllamaState { Ready = true, Label = "QWEN 3.5 / 9B" };
                if (first == null && model.IndexOf("embed", StringComparison.OrdinalIgnoreCase) < 0) first = model;
            }
            if (first != null) return new OllamaState { Ready = true, Label = first.ToUpperInvariant() };
            return new OllamaState { Ready = false, Label = "SIN MODELO" };
        }

        private string GetPairCode()
        {
            string json = GetHttp("http://127.0.0.1:" + BridgePort + "/pair-code", LocalUrl);
            if (json == null) return null;
            Match match = Regex.Match(json, "\\\"code\\\"\\s*:\\s*\\\"?(\\d{6})\\\"?");
            return match.Success ? match.Groups[1].Value : null;
        }

        private void RefreshSystemStatus()
        {
            RefreshExecutablePaths();
            Version nodeVersion = GetNodeVersion();
            bool nodeReady = nodeVersion != null && nodeVersion >= new Version(22, 13, 0) && !string.IsNullOrEmpty(npmPath);
            SetCard(nodeCard, nodeVersion == null ? "NO INSTALADO" : "V" + nodeVersion, nodeReady, violet);

            bool bridgeReady = TestTcp(BridgePort);
            SetCard(agentCard, bridgeReady ? "ACTIVO" : "DETENIDO", bridgeReady, cyan);

            OllamaState ollama = GetOllamaState();
            SetCard(aiCard, ollama.Label, ollama.Ready, mint);

            string pairCode = bridgeReady ? GetPairCode() : null;
            pairCodeLabel.Text = string.IsNullOrEmpty(pairCode) ? "SIN CODIGO" : pairCode;
            if (!string.IsNullOrEmpty(pairCode))
            {
                if (copyCodeButton.Text != "COPIADO") copyCodeButton.Text = "COPIAR CODIGO";
            }
            else
            {
                copyCodeButton.Text = bridgeReady ? "GENERANDO..." : "INICIAR AGENTE";
            }

            bool localReady = TestWebReady(LocalUrl);
            if (localReady)
            {
                localButton.Text = "ABRIR REEBOT";
                localButton.Enabled = true;
                activityLabel.Text = ollama.Ready ? "SISTEMA LISTO  /  IA LOCAL ACTIVA" : "SISTEMA LISTO  /  ANALISIS BASICO";
                activityLabel.ForeColor = Color.FromArgb(22, 132, 92);
                if (openWhenReady && !openedLocal)
                {
                    openedLocal = true;
                    OpenUrl(LocalUrl);
                }
            }
            else if (!actionInProgress)
            {
                localButton.Text = "INICIAR EN LOCAL";
                localButton.Enabled = true;
                activityLabel.Text = "LISTO PARA INICIAR";
                activityLabel.ForeColor = Color.FromArgb(98, 98, 108);
            }
        }

        private bool OpenUrl(string url)
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(url);
                info.UseShellExecute = true;
                Process.Start(info);
                return true;
            }
            catch
            {
                try
                {
                    string explorer = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
                    Process.Start(explorer, "\"" + url + "\"");
                    return true;
                }
                catch
                {
                    Clipboard.SetText(url);
                    MessageBox.Show("Windows no pudo abrir el navegador. La direccion se copio al portapapeles.", "REEBOT LAB", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return false;
                }
            }
        }

        private bool InstallNode()
        {
            string localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string winget = FindExecutable("winget.exe", Path.Combine(localData, "Microsoft", "WindowsApps", "winget.exe"));
            if (winget == null)
            {
                OpenUrl("https://nodejs.org/en/download");
                MessageBox.Show("No encontre winget. Abri la pagina oficial; instala Node.js LTS y vuelve al launcher.", "Instalacion manual", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return false;
            }
            try
            {
                activityLabel.Text = "INSTALANDO NODE.JS  /  ACEPTA EL PERMISO DE WINDOWS";
                activityLabel.ForeColor = violet;
                Refresh();
                ProcessStartInfo info = new ProcessStartInfo();
                info.FileName = winget;
                info.Arguments = "install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements";
                info.UseShellExecute = true;
                info.Verb = "runas";
                info.WindowStyle = ProcessWindowStyle.Normal;
                using (Process process = Process.Start(info))
                {
                    process.WaitForExit();
                    if (process.ExitCode != 0) throw new InvalidOperationException("winget termino con codigo " + process.ExitCode);
                }
                RefreshExecutablePaths();
                Version version = GetNodeVersion();
                if (version == null || version < new Version(22, 13, 0)) throw new InvalidOperationException("Node.js no aparecio despues de instalarse.");
                MessageBox.Show("Node.js " + version + " quedo instalado. REEBOT continuara.", "Node.js listo", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return true;
            }
            catch (Exception exception)
            {
                MessageBox.Show("No pude completar la instalacion automatica.\r\n\r\n" + exception.Message, "REEBOT LAB", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
        }

        private bool ConfirmDependencies()
        {
            string vinextCommand = Path.Combine(projectRoot, "node_modules", ".bin", "vinext.cmd");
            if (File.Exists(vinextCommand)) return true;
            bool partialInstall = Directory.Exists(Path.Combine(projectRoot, "node_modules"));
            DialogResult choice = MessageBox.Show(
                partialInstall
                    ? "La preparacion anterior quedo incompleta. REEBOT necesita repararla con npm ci y puede tardar varios minutos.\r\n\r\nContinuar?"
                    : "REEBOT necesita preparar sus componentes la primera vez. Se ejecutara npm ci y puede tardar varios minutos.\r\n\r\nContinuar?",
                "Preparar REEBOT LAB",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );
            if (choice != DialogResult.Yes) return false;
            try
            {
                activityLabel.Text = "PREPARANDO COMPONENTES...";
                activityLabel.ForeColor = violet;
                Refresh();
                string command = "/d /s /c \"\"" + npmPath + "\" ci --include=dev --no-audit --no-fund\"";
                ProcessStartInfo info = new ProcessStartInfo(Environment.GetEnvironmentVariable("ComSpec"), command);
                info.WorkingDirectory = projectRoot;
                info.UseShellExecute = true;
                info.WindowStyle = ProcessWindowStyle.Normal;
                using (Process process = Process.Start(info))
                {
                    process.WaitForExit();
                    if (process.ExitCode != 0) throw new InvalidOperationException("npm ci termino con codigo " + process.ExitCode);
                }
                if (!File.Exists(vinextCommand)) throw new InvalidOperationException("La instalacion termino, pero vinext.cmd no fue creado.");
                return true;
            }
            catch (Exception exception)
            {
                MessageBox.Show("No pude preparar los componentes.\r\n\r\n" + exception.Message, "REEBOT LAB", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
        }

        private void StartOllama()
        {
            OllamaState state = GetOllamaState();
            if (state.Ready || ollamaPath == null) return;
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(ollamaPath, "serve");
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(info);
            }
            catch { }
        }

        private void StartBridge()
        {
            if (TestTcp(BridgePort)) return;
            string agent = Path.Combine(projectRoot, "telemetry-server.ps1");
            if (!File.Exists(agent))
            {
                MessageBox.Show("No encontre telemetry-server.ps1 junto al launcher.", "REEBOT LAB", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            try
            {
                ProcessStartInfo info = new ProcessStartInfo("powershell.exe");
                info.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + agent + "\"";
                info.WorkingDirectory = projectRoot;
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(info);
            }
            catch (Exception exception)
            {
                MessageBox.Show("No pude iniciar el agente local.\r\n\r\n" + exception.Message, "REEBOT LAB", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private bool StartUiProcess()
        {
            if (TestWebReady(LocalUrl)) return true;
            string command = "/d /s /c \"\"" + npmPath + "\" run dev >> \"" + LauncherLogPath + "\" 2>&1\"";
            ProcessStartInfo info = new ProcessStartInfo(Environment.GetEnvironmentVariable("ComSpec"), command);
            info.WorkingDirectory = projectRoot;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Minimized;
            Process process = Process.Start(info);
            System.Threading.Thread.Sleep(1200);
            if (process.HasExited && process.ExitCode != 0)
            {
                MessageBox.Show(
                    "La interfaz no pudo iniciar. Revisa el registro:\r\n\r\n" + LauncherLogPath,
                    "REEBOT LAB",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return false;
            }
            return true;
        }

        private void StartLocal()
        {
            actionInProgress = true;
            localButton.Enabled = false;
            activityLabel.Text = "VALIDANDO COMPONENTES...";
            activityLabel.ForeColor = violet;
            Refresh();
            try
            {
                RefreshExecutablePaths();
                Version nodeVersion = GetNodeVersion();
                bool nodeReady = nodeVersion != null && nodeVersion >= new Version(22, 13, 0) && !string.IsNullOrEmpty(npmPath);
                if (!nodeReady)
                {
                    DialogResult choice = MessageBox.Show(
                        "El modo local necesita Node.js 22.13 o superior. Quieres que REEBOT lo instale automaticamente con winget?",
                        "Falta Node.js",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Information
                    );
                    if (choice != DialogResult.Yes || !InstallNode()) return;
                    RefreshExecutablePaths();
                }
                if (!ConfirmDependencies()) return;
                StartOllama();
                StartBridge();
                if (!StartUiProcess()) return;
                openWhenReady = true;
                openedLocal = false;
                activityLabel.Text = "INICIANDO REEBOT...";
                activityLabel.ForeColor = violet;
            }
            catch (Exception exception)
            {
                MessageBox.Show("No pude iniciar REEBOT LAB.\r\n\r\n" + exception.Message, "REEBOT LAB", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                actionInProgress = false;
                localButton.Enabled = true;
                RefreshSystemStatus();
            }
        }

        private void StartPublished()
        {
            StartOllama();
            StartBridge();
            OpenUrl(PublishedUrl);
            activityLabel.Text = "VERSION WEB ABIERTA  /  USA EL CODIGO DE VINCULACION";
            activityLabel.ForeColor = violet;
        }
    }

    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            if (args != null && args.Length > 0 && string.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase))
            {
                string root = AppDomain.CurrentDomain.BaseDirectory;
                bool ready = File.Exists(Path.Combine(root, "telemetry-server.ps1"))
                    && File.Exists(Path.Combine(root, "package.json"))
                    && File.Exists(Path.Combine(root, "public", "reebot-mascot.png"));
                return ready ? 0 : 2;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
            return 0;
        }
    }
}
