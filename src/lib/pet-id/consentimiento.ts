// src/lib/pet-id/consentimiento.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// DD10 (design.md): los textos de las casillas de consentimiento del
// perfil de la mascota NO van en `translations.ts` — van aquí, igual que
// `kit-caducidad/consentimiento.ts` (R-M2b.1.3/1.4), versionados y con un
// hash que los liga a su versión (`tests/pet-id/consentimiento.test.ts`):
// cambiar una sola palabra sin subir la versión invalidaría el
// consentimiento que ya registraron los dueños (R-QR.11.2).
//
// Textos en BORRADOR, pendientes de revisión legal del propietario (flag 8
// de tasks.md: base jurídica 6.1.a, plazo de conservación y publicación
// del teléfono). Todas las versiones empiezan en v1.
import type { Language } from '@/lib/language-context';

/**
 * @public — casillas del alta y de la edición del perfil (R-QR.4.1,
 * R-QR.5.2, nacen sin marcar). [0] privacidad (obligatoria para el alta),
 * [1] publicación del perfil (obligatoria: sin ella la chapa no muestra
 * nada).
 */
export const TEXTOS_CONSENTIMIENTO_PERFIL: Record<Language, readonly [string, string]> = {
  es: [
    'He leído y acepto la política de privacidad y el tratamiento de los datos que facilito para activar la chapa de mi mascota.',
    'Quiero publicar un perfil público con el nombre, la especie, la foto y las notas de salud de mi mascota, visible para quien escanee el código de la chapa, para que pueda contactarme si la encuentra.',
  ],
  en: [
    "I have read and accept the privacy policy and the processing of the data I provide to activate my pet's tag.",
    "I want to publish a public profile with my pet's name, species, photo and health notes, visible to anyone who scans the tag code, so they can contact me if they find my pet.",
  ],
  fr: [
    "J'ai lu et j'accepte la politique de confidentialité et le traitement des données que je fournis pour activer la plaque de mon animal.",
    "Je souhaite publier un profil public avec le nom, l'espèce, la photo et les notes de santé de mon animal, visible par toute personne qui scanne le code de la plaque, afin qu'elle puisse me contacter si elle le trouve.",
  ],
  it: [
    "Ho letto e accetto l'informativa sulla privacy e il trattamento dei dati che fornisco per attivare la targhetta del mio animale.",
    "Desidero pubblicare un profilo pubblico con il nome, la specie, la foto e le note di salute del mio animale, visibile a chi scansiona il codice della targhetta, in modo che possa contattarmi se lo trova.",
  ],
  de: [
    'Ich habe die Datenschutzerklärung gelesen und akzeptiere die Verarbeitung der Daten, die ich zur Aktivierung der Marke meines Haustieres angebe.',
    'Ich möchte ein öffentliches Profil mit Name, Tierart, Foto und Gesundheitshinweisen meines Haustieres veröffentlichen, sichtbar für jeden, der den Code der Marke scannt, damit er mich kontaktieren kann, wenn er mein Tier findet.',
  ],
};

/** @public — se guardará en `pet_chapas.texto_consentimiento_version` (máx. 32, CHECK en la migración PR1). */
export const TEXTO_CONSENTIMIENTO_PERFIL_VERSION = 'pet-perfil-v1';

/**
 * @public — casilla opcional y revocable desde la gestión para mostrar el
 * teléfono con un botón «Llamar al dueño» (D-PET-7, R-QR.7.1). El texto en
 * español es, literalmente, el fijado por el propietario en la propuesta;
 * las demás traducen con fidelidad y, como pide el propietario, dejan
 * claro que (a) quien escanee verá un botón que llama a ese número y (b)
 * se puede retirar en cualquier momento desde el enlace de gestión.
 */
export const TEXTOS_CONSENTIMIENTO_TELEFONO: Record<Language, string> = {
  es: 'Autorizo que se muestre mi teléfono a quien encuentre a mi mascota: quien escanee el código verá un botón para llamarme a ese número. Puedo retirar esta autorización en cualquier momento desde el enlace de gestión de mi chapa.',
  en: "I authorise my phone number to be shown to whoever finds my pet: anyone who scans the code will see a button to call that number. I can withdraw this authorisation at any time from my tag's management link.",
  fr: "J'autorise l'affichage de mon numéro de téléphone à la personne qui trouve mon animal : toute personne qui scanne le code verra un bouton pour appeler ce numéro. Je peux retirer cette autorisation à tout moment depuis le lien de gestion de ma plaque.",
  it: 'Autorizzo che il mio numero di telefono venga mostrato a chi trova il mio animale: chi scansiona il codice vedrà un pulsante per chiamare quel numero. Posso revocare questa autorizzazione in qualsiasi momento dal link di gestione della targhetta.',
  de: 'Ich erlaube, dass meine Telefonnummer der Person angezeigt wird, die mein Haustier findet: Wer den Code scannt, sieht eine Schaltfläche, um diese Nummer anzurufen. Ich kann diese Erlaubnis jederzeit über den Verwaltungslink meiner Marke widerrufen.',
};

/** @public — se guardará en `pet_chapas.telefono_texto_version` (máx. 32). */
export const TEXTO_CONSENTIMIENTO_TELEFONO_VERSION = 'pet-tel-v1';

/**
 * @public — casilla de privacidad del formulario de contacto por relay
 * (R-QR.10.1). El mensaje y el contacto de quien la marca NO se guardan
 * (DD18); solo se registra lo necesario para aplicar los límites de uso.
 * Esta casilla no se persiste por chapa, así que no tiene columna propia
 * en la migración — la versión queda fijada aquí para la revisión legal.
 */
export const TEXTOS_CONSENTIMIENTO_RELAY: Record<Language, string> = {
  es: 'He leído y acepto la política de privacidad. Sé que mi mensaje y mi contacto se reenviarán al dueño de la mascota por email y no se guardarán.',
  en: "I have read and accept the privacy policy. I understand that my message and contact details will be forwarded to the pet's owner by email and will not be stored.",
  fr: "J'ai lu et j'accepte la politique de confidentialité. Je comprends que mon message et mes coordonnées seront transmis au propriétaire de l'animal par email et ne seront pas conservés.",
  it: "Ho letto e accetto l'informativa sulla privacy. So che il mio messaggio e il mio contatto saranno inviati al proprietario dell'animale via email e non saranno conservati.",
  de: 'Ich habe die Datenschutzerklärung gelesen und akzeptiere sie. Mir ist bewusst, dass meine Nachricht und meine Kontaktdaten per E-Mail an den Besitzer des Haustieres weitergeleitet und nicht gespeichert werden.',
};

export const TEXTO_CONSENTIMIENTO_RELAY_VERSION = 'pet-relay-v1';
