import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
if(existsSync('.env'))throw new Error('.env ya existe. No se ha modificado.');
const secret=randomBytes(36).toString('hex'),password=randomBytes(18).toString('base64url');
const dbPassword=process.env.LOCAL_DB_PASSWORD||randomBytes(24).toString('hex');
writeFileSync('.env',`DATABASE_URL=postgresql://instala:${dbPassword}@localhost:${process.env.LOCAL_DB_PORT||5432}/instala\nPOSTGRES_PASSWORD=${dbPassword}\nBETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://localhost:3000\nDOCUMENT_DIR=./data/documents\nADMIN_EMAIL=responsable@empresa.local\nADMIN_PASSWORD=${password}\nADMIN_NAME=Responsable\nCOMPANY_NAME=Mi empresa instaladora\nPORT_BIND=127.0.0.1\n`,{mode:0o600});
mkdirSync('data',{recursive:true});
writeFileSync('data/ACCESO_LOCAL.txt',`INSTALA · ACCESO INICIAL\n\nDirección: http://localhost:3000\nCorreo: responsable@empresa.local\nContraseña: ${password}\n\nArchivo privado. Guarda la contraseña en tu gestor de contraseñas y retira este archivo.\nNo compartas la carpeta data ni .env.\n`,{mode:0o600});
console.log('Configuración creada con claves aleatorias. Acceso inicial en data/ACCESO_LOCAL.txt.');
