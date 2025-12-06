#!/usr/bin/env node
import { Command } from "commander";
import { init } from "./commands/init";
import { pull } from "./commands/pull";

const program = new Command();

program
  .name("lazy-appwrite")
  .description("CLI to scaffold and manage Lazy Appwrite schemas")
  .version("0.5.0");

program
  .command("init")
  .description("Initialize Lazy Appwrite in your project")
  .action(init);

program
  .command("pull")
  .description("Pull the current database schema from Appwrite")
  .action(pull);

program.parse(process.argv);
