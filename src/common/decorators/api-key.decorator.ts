import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const ApiKey = () => SetMetadata('apiKey', true);
