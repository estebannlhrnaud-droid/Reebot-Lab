using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("REEBOT LAB Desktop")]
[assembly: AssemblyDescription("Aplicacion de escritorio local de REEBOT LAB")]
[assembly: AssemblyCompany("REEBOT LAB")]
[assembly: AssemblyProduct("REEBOT LAB")]
[assembly: AssemblyCopyright("REEBOT LAB Early Access")]
[assembly: AssemblyVersion("0.4.0.0")]
[assembly: AssemblyFileVersion("0.4.0.0")]

namespace ReebotLab.Desktop
{
    internal sealed class DesktopForm : Form
    {
        private readonly string localUrl;
        private readonly WebView2 webView;
        private readonly Panel loadingPanel;
        private readonly Label loadingTitle;
        private readonly Label loadingDetail;
        private readonly Button retryButton;

        public DesktopForm(string url)
        {
            localUrl = url;
            Text = "REEBOT LAB";
            BackColor = Color.FromArgb(7, 7, 10);
            MinimumSize = new Size(1040, 680);
            Size = new Size(1440, 900);
            StartPosition = FormStartPosition.CenterScreen;
            WindowState = FormWindowState.Maximized;
            KeyPreview = true;

            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            webView.DefaultBackgroundColor = Color.White;
            Controls.Add(webView);

            loadingPanel = new Panel();
            loadingPanel.Dock = DockStyle.Fill;
            loadingPanel.BackColor = Color.FromArgb(7, 7, 10);

            loadingTitle = new Label();
            loadingTitle.AutoSize = false;
            loadingTitle.Dock = DockStyle.Top;
            loadingTitle.Height = 76;
            loadingTitle.Padding = new Padding(42, 24, 0, 0);
            loadingTitle.Font = new Font("Segoe UI", 23, FontStyle.Bold);
            loadingTitle.ForeColor = Color.White;
            loadingTitle.Text = "REEBOT  LAB";
            loadingPanel.Controls.Add(loadingTitle);

            loadingDetail = new Label();
            loadingDetail.AutoSize = false;
            loadingDetail.Dock = DockStyle.Top;
            loadingDetail.Height = 62;
            loadingDetail.Padding = new Padding(44, 8, 32, 0);
            loadingDetail.Font = new Font("Segoe UI", 10, FontStyle.Regular);
            loadingDetail.ForeColor = Color.FromArgb(170, 170, 185);
            loadingDetail.Text = "CONECTANDO CON TU PC...";
            loadingPanel.Controls.Add(loadingDetail);

            retryButton = new Button();
            retryButton.Text = "REINTENTAR";
            retryButton.Size = new Size(180, 46);
            retryButton.Location = new Point(44, 154);
            retryButton.FlatStyle = FlatStyle.Flat;
            retryButton.FlatAppearance.BorderColor = Color.FromArgb(137, 91, 255);
            retryButton.ForeColor = Color.White;
            retryButton.BackColor = Color.FromArgb(20, 20, 27);
            retryButton.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            retryButton.Cursor = Cursors.Hand;
            retryButton.Visible = false;
            retryButton.Click += delegate
            {
                retryButton.Visible = false;
                loadingDetail.Text = "VOLVIENDO A CONECTAR...";
                if (webView.CoreWebView2 == null) InitializeWebView();
                else webView.CoreWebView2.Navigate(localUrl);
            };
            loadingPanel.Controls.Add(retryButton);

            Controls.Add(loadingPanel);
            loadingPanel.BringToFront();

            Shown += delegate { InitializeWebView(); };
            KeyDown += delegate(object sender, KeyEventArgs eventArgs)
            {
                if (eventArgs.KeyCode == Keys.F5 && webView.CoreWebView2 != null)
                {
                    webView.CoreWebView2.Reload();
                    eventArgs.Handled = true;
                }
            };
        }

        private async void InitializeWebView()
        {
            try
            {
                string userData = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "REEBOT LAB",
                    "WebView2"
                );
                CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, userData);
                await webView.EnsureCoreWebView2Async(environment);

                webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                webView.CoreWebView2.Settings.IsZoomControlEnabled = true;
                webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;

                webView.CoreWebView2.NavigationStarting += OnNavigationStarting;
                webView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
                webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
                webView.CoreWebView2.ProcessFailed += delegate
                {
                    ShowConnectionError("LA INTERFAZ SE DETUVO. PUEDES REINTENTAR SIN CERRAR REEBOT.");
                };
                webView.CoreWebView2.Navigate(localUrl);
            }
            catch (WebView2RuntimeNotFoundException)
            {
                ShowConnectionError("FALTA WEBVIEW2 RUNTIME. REEBOT PUEDE INSTALARLO DESDE LA PAGINA OFICIAL DE MICROSOFT.");
                DialogResult choice = MessageBox.Show(
                    "REEBOT necesita Microsoft WebView2 Runtime para mostrar la app. Quieres abrir la descarga oficial?",
                    "Falta WebView2 Runtime",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Information
                );
                if (choice == DialogResult.Yes) OpenExternal("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
            }
            catch (Exception exception)
            {
                ShowConnectionError("NO PUDE ABRIR LA APP. " + exception.Message.ToUpperInvariant());
            }
        }

        private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs eventArgs)
        {
            Uri target;
            if (!Uri.TryCreate(eventArgs.Uri, UriKind.Absolute, out target)) return;
            bool local = target.IsLoopback && target.Port == 3000;
            if (local) return;
            eventArgs.Cancel = true;
            OpenExternal(eventArgs.Uri);
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs eventArgs)
        {
            if (eventArgs.IsSuccess)
            {
                loadingPanel.Visible = false;
                webView.Focus();
                return;
            }
            ShowConnectionError("REEBOT TODAVIA NO RESPONDE. REVISA EL LAUNCHER O INTENTA DE NUEVO.");
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs eventArgs)
        {
            eventArgs.Handled = true;
            OpenExternal(eventArgs.Uri);
        }

        private void ShowConnectionError(string message)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string>(ShowConnectionError), message);
                return;
            }
            loadingDetail.Text = message;
            retryButton.Visible = true;
            loadingPanel.Visible = true;
            loadingPanel.BringToFront();
        }

        private static void OpenExternal(string url)
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(url);
                info.UseShellExecute = true;
                Process.Start(info);
            }
            catch { }
        }
    }

    internal static class Program
    {
        private const string DefaultUrl = "http://localhost:3000";

        [STAThread]
        private static int Main(string[] args)
        {
            if (HasArgument(args, "--self-test"))
            {
                try
                {
                    string version = CoreWebView2Environment.GetAvailableBrowserVersionString();
                    return string.IsNullOrEmpty(version) ? 2 : 0;
                }
                catch { return 3; }
            }

            string url = ReadUrl(args);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new DesktopForm(url));
            return 0;
        }

        private static bool HasArgument(string[] args, string expected)
        {
            if (args == null) return false;
            foreach (string value in args)
            {
                if (string.Equals(value, expected, StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        private static string ReadUrl(string[] args)
        {
            if (args == null) return DefaultUrl;
            for (int index = 0; index + 1 < args.Length; index++)
            {
                if (!string.Equals(args[index], "--url", StringComparison.OrdinalIgnoreCase)) continue;
                Uri value;
                if (Uri.TryCreate(args[index + 1], UriKind.Absolute, out value) && value.IsLoopback && value.Port == 3000)
                {
                    return value.AbsoluteUri.TrimEnd('/');
                }
            }
            return DefaultUrl;
        }
    }
}
