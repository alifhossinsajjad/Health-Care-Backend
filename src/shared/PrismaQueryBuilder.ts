/* eslint-disable @typescript-eslint/no-explicit-any */
import { IQueryBuilder } from "../app/interfaces/queryBuilder";
import { paginationHelper } from "./paginationHelper";

export class PrismaQueryBuilder<T extends Record<string, unknown>> implements IQueryBuilder<T> {
  private query: T;
  private andConditions: any[] = [];
  private limit: number;
  private skip: number;
  private page: number;
  private sortBy: string;
  private sortOrder: string;

  constructor(query: T) {
    this.query = query;
    const { limit, page, skip, sortBy, sortOrder } =
      paginationHelper.calculatePagination(query);

    this.limit = limit;
    this.skip = skip;
    this.page = page;
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
  }

  // 1. Search Logic
  search(searchableFields: string[]) {
    const searchTerm = this.query.searchTerm as string;
    if (searchTerm) {
      this.andConditions.push({
        OR: searchableFields.map((field) => ({
          [field]: {
            contains: searchTerm,
            mode: "insensitive",
          },
        })),
      });
    }
    return this;
  }

  // 2. Exact Filter Logic & Range Filters
  filter(excludeFields: string[] = ["searchTerm", "page", "limit", "sortBy", "sortOrder", "fields"]) {
    const queryObj = { ...this.query };
    
    // Remove default pagination and search keys
    excludeFields.forEach((el) => delete queryObj[el]);

    if (Object.keys(queryObj).length > 0) {
      this.andConditions.push({
        AND: Object.keys(queryObj).map((key) => {
          let val = queryObj[key];

          // Smart Senior Hack: If the value is already an object (e.g., { lt: 500, gt: 200 }), 
          // it's a range filter from the URL. Pass it directly to Prisma!
          if (typeof val === "object" && val !== null && !Array.isArray(val)) {
            return {
              [key]: val,
            };
          }

          // Convert string booleans to actual booleans for Prisma
          if (val === "true" || val === "false") {
            val = val === "true";
          }

          // Otherwise, it's a simple exact match
          return {
            [key]: {
              equals: val,
            },
          };
        }),
      });
    }
    return this;
  }

  // 3. Add Custom Conditions (For Relational DB filtering in Prisma)
  addCondition(condition: any) {
    if (condition) {
      this.andConditions.push(condition);
    }
    return this;
  }

  // 4. Build the final query options
  build() {
    const where = this.andConditions.length > 0 ? { AND: this.andConditions } : {};
    
    return {
      where,
      skip: this.skip,
      take: this.limit,
      orderBy: {
        [this.sortBy]: this.sortOrder,
      },
    };
  }

  // 5. Get Pagination Meta
  getMeta(totalCount: number) {
    return {
      page: this.page,
      limit: this.limit,
      total: totalCount,
    };
  }
}
