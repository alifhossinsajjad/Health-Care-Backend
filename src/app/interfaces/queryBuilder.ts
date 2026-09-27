export interface IQueryBuilder<T> {
  search(searchableFields: string[]): this;
  filter(excludeFields?: string[]): this;
  addCondition(condition: any): this;
  build(): Record<string, any>;
  getMeta(totalCount: number): Record<string, number>;
}
