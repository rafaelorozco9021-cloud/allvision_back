import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Marca un endpoint como accesible sin API key. Todo lo demas la exige. */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC, true);
