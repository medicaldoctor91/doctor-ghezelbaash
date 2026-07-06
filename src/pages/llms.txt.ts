import type { APIRoute } from 'astro';
import { DOCTOR, FAQ, KEY_TOPICS, SERVICES, SITE } from '@data/site';

export const GET: APIRoute = () => {
  const body = `# ${SITE.title}

${SITE.description}

## Entity
- Doctor: ${DOCTOR.name}
- Role: ${DOCTOR.jobTitle}
- City: ${SITE.city}
- Clinic: ${DOCTOR.clinicName}
- Phone: ${SITE.displayPhone}
- Main URL: ${SITE.url}
- Map: ${SITE.mapUrl}
- Instagram: ${SITE.instagram}

## Key topics
${KEY_TOPICS.map((topic) => `- ${topic}`).join('\n')}

## Services
${SERVICES.map((service) => `- ${service.title}: ${service.summary}`).join('\n')}

## FAQ
${FAQ.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join('\n\n')}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
