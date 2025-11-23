import { RelationMutate } from "node-appwrite";

export enum ColumnType {
  String = "string",
  Integer = "integer",
  Float = "float",
  Boolean = "boolean",

  // Specifics.
  Email = "email",
  Url = "url",
  Ip = "ip",
  Datetime = "datetime",
  Enum = "enum",

  // Geometry
  Point = "point",
  Polygon = "polygon",
  Line = "line",

  Relationship = "relationship",
}

export enum IndexType {
  Key = "key",
  Unique = "unique",
  FullText = "fulltext",
  Spatial = "spatial",
}

export enum RelationshipType {
  OneToOne = "oneToOne",
  OneToMany = "oneToMany",
  ManyToOne = "manyToOne",
  ManyToMany = "manyToMany",
}

export enum LazyErrorType {
  VALIDATION = "VALIDATION",
  APPWRITE = "APPWRITE",
  TIMEOUT = "TIMEOUT",
  CONFIG = "CONFIG",
  ABORT = "ABORT",
}

export enum onDelete {
  Restrict = "restrict",
  Cascade = "cascade",
  SetNull = "setNull",
}

export type OnDeleteRelation = RelationMutate;

export const onDeleteToRelation = (v: onDelete): RelationMutate =>
  v as unknown as RelationMutate;

export const onDeleteValues: RelationMutate[] = [
  onDeleteToRelation(onDelete.Restrict),
  onDeleteToRelation(onDelete.Cascade),
  onDeleteToRelation(onDelete.SetNull),
];
