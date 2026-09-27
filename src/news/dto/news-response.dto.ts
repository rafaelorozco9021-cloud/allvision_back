import { IsString, IsInt, IsDateString, IsOptional, IsNumber, IsArray, IsBoolean } from 'class-validator';

export class NewsResponseDto {
  @IsString()
  id!: string;

  @IsString()
  canonicalUrl!: string;

  @IsString()
  title!: string;

  @IsString()
  summary!: string;

  @IsString()
  mainImage!: string;

  @IsString()
  url!: string;

  @IsString()
  source!: string;

  @IsDateString()
  publishedAt!: string;

  @IsNumber()
  viralScore!: number;

  @IsInt()
  sourceCount!: number;

  @IsOptional()
  @IsString()
  clusterId?: string | null;

  @IsOptional()
  @IsBoolean()
  isRepresentative?: boolean;

  /** True si la fuente no autoriza republicar su fotografia. */
  @IsOptional()
  @IsBoolean()
  imagesBlocked?: boolean;

  @IsOptional()
  @IsString()
  category?: string;
}

export class NewsListResponseDto {
  @IsArray()
  news!: NewsResponseDto[];

  @IsInt()
  total!: number;

  @IsInt()
  page!: number;

  @IsInt()
  limit!: number;

  @IsInt()
  totalPages!: number;
}

export class TrendingResponseDto {
  @IsArray()
  trending!: NewsResponseDto[];
}
