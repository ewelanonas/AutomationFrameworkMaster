using System.Globalization;
using Microsoft.Extensions.Configuration;

namespace AutomationFramework.Core.Support;

/// <summary>
/// Builds the <see cref="AppConfig"/> once per process, resolving values lowest precedence first:
/// <list type="number">
///   <item><c>shared/environments/&lt;env&gt;.json</c> â€” non-secret defaults, committed</item>
///   <item><c>.env</c> at the repository root â€” local overrides, gitignored</item>
///   <item>Real process environment variables â€” always win, this is how CI injects secrets</item>
/// </list>
/// </summary>
/// <remarks>
/// Resolution fails loudly and names every missing key. It never falls back to a production URL, and
/// never substitutes a blank for a missing setting: a suite that silently points somewhere unexpected
/// is worse than one that refuses to start.
/// </remarks>
public static class ConfigLoader
{
    private static readonly object Gate = new();
    private static AppConfig? _cached;

    /// <summary>The resolved configuration for this process. Safe to call from many threads.</summary>
    public static AppConfig Config
    {
        get
        {
            lock (Gate)
            {
                if (_cached is null)
                {
                    _cached = Load();
                    LogResolvedTargets(_cached);
                }

                return _cached;
            }
        }
    }

    private static AppConfig Load()
    {
        string envName = ResolveEnvName();
        string environmentFile = Path.Combine(RepoPaths.Environments(), envName + ".json");

        if (!File.Exists(environmentFile))
        {
            throw new InvalidOperationException(
                $"No environment descriptor at {environmentFile}. Create it, or select another with "
                + "-e AF_ENV=<name>.");
        }

        IConfigurationRoot file = new ConfigurationBuilder()
            .AddJsonFile(environmentFile, optional: false)
            .Build();

        Dictionary<string, string> overrides = ReadDotEnvFile();

        string? uiBaseUrl = ValueOf("AF_UI_BASEURL", overrides, file["ui:baseUrl"]);
        string? apiBaseUrl = ValueOf("AF_API_BASEURL", overrides, file["api:baseUrl"]);

        List<string> missing = [];
        if (string.IsNullOrWhiteSpace(uiBaseUrl))
        {
            missing.Add("ui.baseUrl (or AF_UI_BASEURL)");
        }

        if (string.IsNullOrWhiteSpace(apiBaseUrl))
        {
            missing.Add("api.baseUrl (or AF_API_BASEURL)");
        }

        if (missing.Count > 0)
        {
            throw new InvalidOperationException(
                $"Configuration is incomplete for environment '{envName}'. Missing: "
                + string.Join(", ", missing)
                + $". Checked {environmentFile}, the .env file, and process environment variables.");
        }

        UiConfig ui = new(
            StripTrailingSlash(uiBaseUrl!),
            TextOr(file["ui:locale"], "en-US"),
            TextOr(file["ui:timezoneId"], "UTC"),
            IntOr(file["ui:viewport:width"], 1440),
            IntOr(file["ui:viewport:height"], 900));

        ApiConfig api = new(
            StripTrailingSlash(apiBaseUrl!),
            TextOr(file["api:loginPath"], "/users/login"));

        Timeouts timeouts = new(
            IntOr(file["timeouts:elementMs"], 10_000),
            IntOr(file["timeouts:navigationMs"], 30_000),
            IntOr(file["timeouts:apiMs"], 30_000),
            IntOr(file["timeouts:workflowMs"], 60_000));

        ExecutionConfig execution = new(
            BooleanOf("AF_HEADLESS", overrides, file["execution:headless"], defaultValue: true),
            TextOf("AF_BROWSER", overrides, file["execution:browser"], "chromium"),
            TextOr(file["execution:testIdAttribute"], "data-testid"));

        Credentials credentials = new(
            EnvironmentValue("AF_AUTH_USERNAME", overrides),
            EnvironmentValue("AF_AUTH_PASSWORD", overrides),
            EnvironmentValue("AF_AUTH_ADMIN_USERNAME", overrides),
            EnvironmentValue("AF_AUTH_ADMIN_PASSWORD", overrides));

        return new AppConfig(envName, ui, api, timeouts, execution, credentials);
    }

    private static void LogResolvedTargets(AppConfig config)
    {
        // Written once, and deliberately. The single most common wasted debugging hour is a suite
        // that was pointing somewhere other than where the engineer assumed.
        TestLog.Info(
            $"Environment '{config.EnvName}' resolved. UI={config.Ui.BaseUrl} API={config.Api.BaseUrl} "
            + $"headless={config.Execution.Headless} browser={config.Execution.Browser} "
            + $"testIdAttribute={config.Execution.TestIdAttribute} runId={RunContext.RunId}");
    }

    private static string ResolveEnvName()
    {
        string? fromEnvironment = Environment.GetEnvironmentVariable("AF_ENV");
        return string.IsNullOrWhiteSpace(fromEnvironment) ? "local" : fromEnvironment.Trim();
    }

    /// <summary>
    /// Reads <c>.env</c> at the repository root if it exists. Absent is normal: CI injects real
    /// environment variables instead.
    /// </summary>
    private static Dictionary<string, string> ReadDotEnvFile()
    {
        Dictionary<string, string> values = new(StringComparer.Ordinal);
        string path = Path.Combine(RepoPaths.RepoRoot(), ".env");

        if (!File.Exists(path))
        {
            return values;
        }

        foreach (string rawLine in File.ReadAllLines(path))
        {
            string line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#'))
            {
                continue;
            }

            int separator = line.IndexOf('=', StringComparison.Ordinal);
            if (separator <= 0)
            {
                continue;
            }

            string key = line[..separator].Trim();
            string value = Unquote(line[(separator + 1)..].Trim());
            if (value.Length > 0)
            {
                values[key] = value;
            }
        }

        return values;
    }

    private static string Unquote(string value)
    {
        if (value.Length >= 2)
        {
            bool doubleQuoted = value.StartsWith('"') && value.EndsWith('"');
            bool singleQuoted = value.StartsWith('\'') && value.EndsWith('\'');
            if (doubleQuoted || singleQuoted)
            {
                return value[1..^1];
            }
        }

        return value;
    }

    /// <summary>Process environment beats .env; .env beats nothing. Neither falls back to the JSON file.</summary>
    private static string? EnvironmentValue(string variableName, Dictionary<string, string> dotEnv)
    {
        string? fromProcess = Environment.GetEnvironmentVariable(variableName);
        if (!string.IsNullOrWhiteSpace(fromProcess))
        {
            return fromProcess.Trim();
        }

        if (dotEnv.TryGetValue(variableName, out string? fromDotEnv)
            && !string.IsNullOrWhiteSpace(fromDotEnv))
        {
            return fromDotEnv.Trim();
        }

        return null;
    }

    private static string? ValueOf(
        string variableName,
        Dictionary<string, string> dotEnv,
        string? fallback)
        => EnvironmentValue(variableName, dotEnv) ?? fallback;

    private static string TextOf(
        string variableName,
        Dictionary<string, string> dotEnv,
        string? fallback,
        string defaultValue)
    {
        string? resolved = ValueOf(variableName, dotEnv, fallback);
        return string.IsNullOrWhiteSpace(resolved) ? defaultValue : resolved;
    }

    private static bool BooleanOf(
        string variableName,
        Dictionary<string, string> dotEnv,
        string? fallback,
        bool defaultValue)
    {
        string? fromEnvironment = EnvironmentValue(variableName, dotEnv);
        if (fromEnvironment is not null && bool.TryParse(fromEnvironment, out bool parsed))
        {
            return parsed;
        }

        if (!string.IsNullOrWhiteSpace(fallback) && bool.TryParse(fallback, out bool fromFile))
        {
            return fromFile;
        }

        return defaultValue;
    }

    private static string TextOr(string? value, string defaultValue)
        => string.IsNullOrWhiteSpace(value) ? defaultValue : value;

    private static int IntOr(string? value, int defaultValue)
    {
        if (!string.IsNullOrWhiteSpace(value)
            && int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out int parsed))
        {
            return parsed;
        }

        return defaultValue;
    }

    private static string StripTrailingSlash(string url)
        => url.EndsWith('/') ? url[..^1] : url;
}
