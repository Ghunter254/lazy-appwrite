#!/usr/bin/env node
import { Command } from "commander";
import { init } from "./commands/init";

const program = new Command();

program
  .name("lazy-appwrite")
  .description("CLI to scaffold and manage Lazy Appwrite schemas")
  .version("0.5.0");

program
  .command("init")
  .description("Initialize Lazy Appwrite in your project")
  .action(init);

program.parse(process.argv);
