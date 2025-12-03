import { Query } from "node-appwrite";
import type { QueryInput } from "../types/interface";

export class QueryMapper {
  /**
   * Transforms a user-friendly JSON object or array into Appwrite Query strings.
   * * Supports MongoDB-style operators ($gt, $lt, $search, etc).
   * * @param queries - The raw query input (Object { a: 1 } or Array ["equal..."])
   * @param limit - Optional limit
   * @param offset - Optional offset
   * @returns An array of strings ready for the SDK
   */
  static parse(
    queries: QueryInput = [],
    limit?: number,
    offset?: number
  ): string[] {
    let finalQueries: string[] = [];

    // Handle the leagcy Array syntax.
    if (Array.isArray(queries)) {
      finalQueries = [...queries];
    }

    // Handle the Object syntax.
    else if (typeof queries === "object") {
      for (const [key, value] of Object.entries(queries)) {
        // Handle primitives
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          // @ts-ignore
          finalQueries.push(Query.equal(key, value));
          continue;
        }

        const operators = value as Record<string, any>;

        for (const [operator, opValue] of Object.entries(operators)) {
          switch (operator) {
            case "$eq":
              finalQueries.push(Query.equal(key, opValue));
              break;

            case "$ne":
              finalQueries.push(Query.notEqual(key, opValue));
              break;
            case "$gt":
              finalQueries.push(Query.greaterThan(key, opValue));
              break;
            case "$gte":
              finalQueries.push(Query.greaterThanEqual(key, opValue));
              break;
            case "$lt":
              finalQueries.push(Query.lessThan(key, opValue));
              break;
            case "$lte":
              finalQueries.push(Query.lessThanEqual(key, opValue));
              break;
            case "$search":
              finalQueries.push(Query.search(key, opValue));
              break;
            case "$in": // Appwrite treats equal([array]) as "In"
              finalQueries.push(Query.equal(key, opValue));
              break;
            case "$between":
              if (Array.isArray(opValue) && opValue.length === 2) {
                finalQueries.push(Query.between(key, opValue[0], opValue[1]));
              }
              break;
            case "$startsWith":
              finalQueries.push(Query.startsWith(key, opValue));
              break;
            case "$endsWith":
              finalQueries.push(Query.endsWith(key, opValue));
              break;
            case "$isNull":
              if (opValue === true) finalQueries.push(Query.isNull(key));
              break;
            case "$isNotNull":
              if (opValue === true) finalQueries.push(Query.isNotNull(key));
              break;
            default:
              console.warn(
                `⚠️ [LazyAppwrite] Unknown query operator: ${operator}`
              );
          }
        }
      }
    }

    if (limit) finalQueries.push(Query.limit(limit));
    if (offset) finalQueries.push(Query.offset(offset));

    return finalQueries;
  }
}
