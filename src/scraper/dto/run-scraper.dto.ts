import { IsString, IsOptional, IsInt, IsDate, Min, Max } from 'class-validator';

export class RunScraperDto {
  @IsOptional()
  @IsString()
  sourceName?: string;
}
