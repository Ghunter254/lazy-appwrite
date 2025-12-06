import chalk from "chalk";
import inquirer from "inquirer";
import { Client, Query, TablesDB } from "node-appwrite";
import path from "node:path";
import fs from "fs-extra";
import dotenv from "dotenv";
import { json } from "node:stream/consumers";

export async function pull() {
  console.log(chalk.blue("Pulling database schema from Appwrite..."));

  const envPath = await inquirer.prompt([
    {
      type: "input",
      name: "envFilePath",
      message: "Enter the path to your .env file:",
      default: ".env",

      validate: (input: string) => {
        const fullPath = path.resolve(process.cwd(), input);
        if (fs.existsSync(fullPath)) {
          return true;
        }
        return "The specified .env file does not exist. Please provide a valid path.";
      },
    },
  ]);

  const fullPath = path.resolve(process.cwd(), envPath.envFilePath);
  dotenv.config({ path: fullPath });

  // Getting credentials from environment variables
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;

  console.log(chalk.gray("Using Appwrite Endpoint:", endpoint));
  console.log(chalk.gray("Using Appwrite Project ID:", projectId));
  console.log(chalk.gray("Using Appwrite API Key:", apiKey));

  if (!endpoint || !projectId || !apiKey) {
    console.error(
      chalk.red(
        "Error: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY must be set in environment variables."
      )
    );
    process.exit(1);
  }

  // Initilializing Appwrite client
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

  const databases = new TablesDB(client);

  try {
    const dbList = await databases.list();

    if (dbList.total === 0) {
      console.log(chalk.yellow("No databases found in the Appwrite project."));
      return;
    }
    console.log(chalk.green("Successfully pulled database schema:"));
    const dbChoices = dbList.databases.map((db: any) => {
      return {
        name: db.name && db.name.trim() !== "" ? db.name : `[ID: ${db.$id}]`,
        value: db.$id,
      };
    });

    console.log(chalk.gray(`Found ${dbList.total} databases.`));
    // console.log(
    //   `Databases found: ${JSON.stringify(dbList.databases, null, 2)}`
    // );

    const answers = await inquirer.prompt([
      {
        type: "rawlist",
        name: "databaseId",
        message: "Select a database to pull schema from:",
        choices: dbChoices,
      },
      {
        type: "input",
        name: "outputPath",
        message: "Enter the output path for the schema file:",
        default: "src/lib/schemas.ts",
      },
      {
        type: "input",
        name: "dbImportPath",
        message: "Relative path to your initialized 'db' instance?",
        default: "./appwrite",
        suffix: " (e.g. '../lib/appwrite')",
      },
    ]);

    console.log(
      chalk.gray(`Fetching schema for database ID: ${answers.databaseId}`)
    );
    const tables = await getTablesSchema(databases, answers.databaseId);

    if (tables.length === 0) {
      console.log(chalk.yellow("No tables found in the selected database."));
      return;
    }

    // Generating schema file content
    let fileContent = `import { TableSchema, ColumnType, IndexType, RelationshipType, onDelete } from "lazy-appwrite";\n\n`;
    fileContent += `import { db } from "${answers.dbImportPath}";\n\n`;

    for (const table of tables) {
      fileContent += await generateSchemaCode(
        databases,
        answers.databaseId,
        table
      );
      fileContent += `\n`;
    }

    // Writing to file
    const outputPath = path.resolve(process.cwd(), answers.outputPath);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, fileContent, "utf8");

    console.log(
      chalk.green(`Schema successfully written to ${answers.outputPath}`)
    );
  } catch (error: any) {
    console.error(chalk.red("Error pulling database schema:"), error.message);
    process.exit(1);
  }
}

async function getTablesSchema(databases: TablesDB, databaseId: string) {
  let allTables: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await databases.listTables({
      databaseId: databaseId,
      queries: [Query.offset(offset), Query.limit(100)],
    });
    allTables.push(...response.tables);
    offset += response.tables.length;
    if (response.tables.length < 100) {
      hasMore = false;
    }
  }
  return allTables;
}

async function generateSchemaCode(
  databases: TablesDB,
  databaseId: string,
  table: any
): Promise<string> {
  const [columnsResponse, indexesResponse] = await Promise.all([
    databases.listColumns({
      databaseId: databaseId,
      tableId: table.$id,
    }),
    databases.listIndexes({
      databaseId: databaseId,
      tableId: table.$id,
    }),
  ]);

  const rawName = sanitizeName(table.name);
  const varName = `${rawName}TableSchema`;
  const modelName = rawName;

  let code = `const ${varName}: TableSchema = {\n`;
  code += `  id: "${table.$id}",\n`;
  code += `  name: "${table.name}",\n`;

  if (!table.enabled) code += `  enabled: false,\n`;
  if (table.documentSecurity) code += `  documentSecurity: true,\n`;

  code += `  columns: [\n`;
  for (const col of columnsResponse.columns) {
    code += mapColumn(col);
  }
  code += `  ],\n`;

  // Indexes
  if (indexesResponse.indexes.length > 0) {
    code += `  indexes: [\n`;
    for (const idx of indexesResponse.indexes) {
      code += mapIndex(idx);
    }
    code += `  ]\n`;
  } else {
    code += `  indexes: []\n`;
  }

  code += `};\n`;

  code += `export const ${modelName} = db.model(${varName});\n`;
  return code;
}

function sanitizeName(name: string) {
  // Converts "User Posts" -> "UserPosts"
  return name.replace(/[^a-zA-Z0-9]/g, "");
}

function mapIndex(idx: any): string {
  console.log("Mapping index:", idx);
  let type = "IndexType.Key";
  if (idx.type === "unique") type = "IndexType.Unique";
  if (idx.type === "fulltext") type = "IndexType.Fulltext";
  if (idx.type === "spatial") type = "IndexType.Spatial"; // Should verify Appwrite return string

  return `    { key: "${idx.key}", type: ${type}, columns: ${JSON.stringify(
    idx.columns
  )} },\n`;
}

function mapColumn(col: any): string {
  let line = `    { key: "${col.key}", `;

  // Type Mapping
  switch (col.type) {
    case "string":
      // Check specific formats
      if (col.format === "email") line += `type: ColumnType.Email, `;
      else if (col.format === "url") line += `type: ColumnType.Url, `;
      else if (col.format === "ip") line += `type: ColumnType.Ip, `;
      else if (col.format === "enum") {
        line += `type: ColumnType.Enum, elements: ${JSON.stringify(
          col.elements
        )}, `;
      } else line += `type: ColumnType.String, size: ${col.size}, `;
      break;
    case "integer":
      line += `type: ColumnType.Integer, `;
      break;
    case "double":
      line += `type: ColumnType.Float, `;
      break;
    case "boolean":
      line += `type: ColumnType.Boolean, `;
      break;
    case "datetime":
      line += `type: ColumnType.Datetime, `;
      break;

    // Geo-location types
    case "point":
      line += `type: ColumnType.Point, `;
      break;
    case "polygon":
      line += `type: ColumnType.Polygon, `;
      break;
    case "line": // Appwrite might return 'line' or 'linestring' depending on version
    case "linestring":
      line += `type: ColumnType.Line, `;
      break;

    // Relationships
    case "relationship":
      line += `type: ColumnType.Relationship, `;
      line += `relatedTableId: "${col.relatedTable}", `;
      line += `relationType: ${mapRelationshipType(col.relationType)}, `;
      line += `twoWay: ${col.twoWay}, `;
      if (col.twoWayKey) line += `twoWayKey: "${col.twoWayKey}", `;
      line += `onDelete: ${mapOnDelete(col.onDelete)}, `;
      break;
    default:
      line += `type: "UNKNOWN", `;
  }

  line += `required: ${col.required}`;

  if (col.default !== null && col.default !== undefined) {
    let def = col.default;

    if (typeof col.default === "string") {
      def = `"${col.default}"`;
    } else if (typeof col.default === "object") {
      // Handle Geo defaults (e.g. [0, 0])
      def = JSON.stringify(col.default);
    }

    line += `, _default: ${def}`;
  }

  line += ` },\n`;
  return line;
}

function mapRelationshipType(type: string): string {
  switch (type) {
    case "oneToOne":
      return "RelationshipType.OneToOne";
    case "oneToMany":
      return "RelationshipType.OneToMany";
    case "manyToOne":
      return "RelationshipType.ManyToOne";
    case "manyToMany":
      return "RelationshipType.ManyToMany";
    default:
      return `'${type}'`;
  }
}

function mapOnDelete(type: string): string {
  switch (type) {
    case "restrict":
      return "onDelete.Restrict";
    case "cascade":
      return "onDelete.Cascade";
    case "setNull":
      return "onDelete.SetNull";
    default:
      return `'${type}'`;
  }
}
