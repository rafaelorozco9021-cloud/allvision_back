import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Solicitud de retirada de contenido. La envia un medio o un titular de
 * derechos cuando considera que una nota no debe mostrarse en AllVision.
 */
export class TakedownRequestDto {
  /** URL canonica de la nota en AllVision (opcional si se manda la del original). */
  @IsOptional()
  @IsString()
  @MaxLength(600)
  newsUrl?: string;

  /** URL del articulo original en el medio. */
  @IsString()
  @MinLength(8)
  @MaxLength(600)
  originalUrl: string;

  /** Medio o titular de derechos. */
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  claimant: string;

  /** Que se retira y por que. */
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;

  /** Contacto del reclamante para responder. */
  @IsEmail()
  contactEmail: string;
}
