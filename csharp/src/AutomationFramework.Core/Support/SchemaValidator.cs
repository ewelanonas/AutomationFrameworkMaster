using System.Text.Json;
using Json.Schema;

namespace AutomationFramework.Core.Support;

/// <summary>
/// Validates real responses against the JSON Schemas in <c>shared/contracts/</c>.
/// </summary>
/// <remarks>
/// The schemas set <c>additionalProperties: false</c>, so this catches a field the service quietly added
/// or renamed — the change that otherwise goes unnoticed until something downstream breaks.
/// <para>
/// The draft version is declared by the validator rather than inline in each schema file, so every
/// language module validates against the same dialect.
/// </para>
/// </remarks>
public static class SchemaValidator
{
    private static readonly object Gate = new();
    private static readonly Dictionary<string, JsonSchema> Cache = new(StringComparer.Ordinal);
    private static bool _contractsLoaded;

    /// <summary>
    /// Returns the validation failures for <paramref name="json"/> against the named schema. An empty
    /// list means the payload conforms.
    /// </summary>
    /// <param name="schemaFileName">
    /// File name inside <c>shared/contracts/</c>, for example <c>toolshop-product.schema.json</c>.
    /// </param>
    /// <param name="json">The response body as text.</param>
    public static List<string> Validate(string schemaFileName, string? json)
    {
        JsonSchema schema = SchemaFor(schemaFileName);

        using JsonDocument document = Parse(json);

        EvaluationResults results = schema.Evaluate(
            document.RootElement,
            new EvaluationOptions
            {
                OutputFormat = OutputFormat.List,
                RequireFormatValidation = false,
            });

        List<string> messages = [];
        if (results.IsValid)
        {
            return messages;
        }

        CollectErrors(results, messages);

        if (messages.Count == 0)
        {
            // Defensive: an invalid result with no detail would produce an empty failure list, which
            // reads as a pass. That would be worse than a vague message.
            messages.Add(
                $"The payload does not conform to {schemaFileName}, but the validator reported no "
                + "detail. Check the schema is well formed.");
        }

        return messages;
    }

    /// <summary>
    /// Flattens the evaluation tree into readable messages.
    /// </summary>
    /// <remarks>
    /// A plain recursive walk with loops rather than a LINQ pipeline: this is the method someone reads
    /// while a contract test is failing, and it should not need decoding.
    /// </remarks>
    private static void CollectErrors(EvaluationResults results, List<string> messages)
    {
        if (results.Errors is not null)
        {
            foreach (KeyValuePair<string, string> error in results.Errors)
            {
                string location = results.InstanceLocation.ToString();
                if (string.IsNullOrEmpty(location))
                {
                    location = "(root)";
                }

                messages.Add($"{location}: {error.Value}");
            }
        }

        if (results.Details is null)
        {
            return;
        }

        foreach (EvaluationResults nested in results.Details)
        {
            CollectErrors(nested, messages);
        }
    }

    private static JsonSchema SchemaFor(string schemaFileName)
    {
        lock (Gate)
        {
            LoadContractsOnce();

            if (Cache.TryGetValue(schemaFileName, out JsonSchema? cached))
            {
                return cached;
            }

            string available = string.Join(", ", Cache.Keys);
            throw new InvalidOperationException(
                $"No schema named '{schemaFileName}' in {RepoPaths.Contracts()}. "
                + $"Available: {available}. Contracts live in shared/contracts/ and are committed.");
        }
    }

    /// <summary>
    /// Loads every contract file exactly once.
    /// </summary>
    /// <remarks>
    /// Two things make this the right shape, and both were learned by getting it wrong first.
    /// <para>
    /// <c>JsonSchema.FromFile</c> has a side effect: it registers the schema in the global registry under
    /// its own file URI. Calling it twice for the same file throws "Overwriting registered schemas is not
    /// permitted" — so loading has to happen exactly once, which is why there is no per-schema lazy load.
    /// </para>
    /// <para>
    /// That same automatic registration is what makes cross-file references work. The paged-products
    /// schema references the product schema with a relative <c>$ref</c>, which resolves against the
    /// referring schema's base URI — its own file URI — producing the sibling's file URI. Loading the whole
    /// folder up front means that URI is already registered, so no network fetch is attempted.
    /// </para>
    /// </remarks>
    private static void LoadContractsOnce()
    {
        if (_contractsLoaded)
        {
            return;
        }

        string contractsDirectory = RepoPaths.Contracts();

        foreach (string file in Directory.GetFiles(contractsDirectory, "*.schema.json"))
        {
            Cache[Path.GetFileName(file)] = JsonSchema.FromFile(file);
        }

        if (Cache.Count == 0)
        {
            throw new InvalidOperationException(
                $"No *.schema.json files found in {contractsDirectory}.");
        }

        _contractsLoaded = true;
    }

    private static JsonDocument Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            throw new InvalidOperationException(
                "Response body is empty, so it cannot be validated against a schema.");
        }

        try
        {
            return JsonDocument.Parse(json);
        }
        catch (JsonException e)
        {
            throw new InvalidOperationException(
                "Response body is not valid JSON, so it cannot be validated against a schema. "
                + $"Body starts: {Redaction.Body(Preview(json))}",
                e);
        }
    }

    private static string Preview(string json)
        => json.Length <= 300 ? json : json[..300] + "...";
}
