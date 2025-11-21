import { ColumnType, IndexType, onDelete, RelationshipType } from "./enum";

type RequiredRule<T> =
  | { required: true; _default?: never }
  | { required: false; _default?: T | null };

type Coordinate = [number, number];

interface ColumnBase {
  key: string;
  required: boolean;
  array?: boolean;
}

/* Defines the structure of a string attr.
 */
export type StringColumn = ColumnBase & {
  type: ColumnType.String;
  size: number; // Here the Max allowed number is 1073741824
} & RequiredRule<string>;

/* Defines the structure of a number attr.
 */
export type NumberColumn = ColumnBase & {
  type: ColumnType.Integer | ColumnType.Float;
  min?: number;
  max?: number;
} & RequiredRule<number>;

/* Defines the structure of a bool attr.
 */
export type BooleanColumn = ColumnBase & {
  type: ColumnType.Boolean;
} & RequiredRule<boolean>;

/* Defines the structure of an enum.
Needs specific options.
*/
export type EnumColumn = ColumnBase & {
  type: ColumnType.Enum;
  elements: string[];
} & RequiredRule<string>;

export type PointColumn = ColumnBase & {
  type: ColumnType.Point;
} & RequiredRule<Coordinate>;

export type LineColumn = ColumnBase & {
  type: ColumnType.Line;
} & RequiredRule<Coordinate[]>;

export type PolygonColumn = ColumnBase & {
  type: ColumnType.Polygon;
} & RequiredRule<Coordinate[][]>;

export type RelationshipColumn = ColumnBase & {
  type: ColumnType.Relationship;
  relatedTableId: string;
  relationType: RelationshipType;
  twoWay: boolean;
  twoWayKey?: string;
  onDelete: onDelete;
} & RequiredRule<null>;

export type SimpleColumn = ColumnBase & {
  type: ColumnType.Email | ColumnType.Url | ColumnType.Ip | ColumnType.Datetime;
} & RequiredRule<string>;

export type ColumnSchema =
  | StringColumn
  | NumberColumn
  | BooleanColumn
  | EnumColumn
  | SimpleColumn
  | PointColumn
  | PolygonColumn
  | LineColumn
  | RelationshipColumn;

export interface IndexSchema {
  key: string;
  type: IndexType;
  columns: string[];
}

export interface TableSchema {
  id: string;
  name: string;
  permissions?: string[];
  rowSecurity?: boolean;
  enabled?: boolean;
  columns: ColumnSchema[];
  indexes?: IndexSchema[];
}
