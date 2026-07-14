const targets = {
  'botulinum-toxin': 'botulinum-toxin-guide',
  'dermal-filler': 'dermal-filler-guide',
  'thread-lift': 'thread-lift-guide',
  'subcision': 'subcision-guide',
  'acne-scar-treatment': 'acne-scar-types',
  'skin-rejuvenation': 'skin-scar-rejuvenation',
  'prp-skin-hair': 'aesthetic-services-kermanshah',
  'mesotherapy': 'aesthetic-services-kermanshah',
  'hair-loss-evaluation': 'hair-loss-diagnosis',
  'submental-liposuction': 'submental-liposuction-guide',
  'body-contouring': 'body-contouring-evaluation',
  'blepharoplasty': 'blepharoplasty-evaluation',
  'rhinoplasty': 'rhinoplasty-evaluation',
  'facelift-necklift': 'facelift-necklift-evaluation',
  'orthognathic-surgery': 'orthognathic-surgery-evaluation',
  'hair-transplant': 'hair-transplant-surgical-evaluation',
};

export const homepageServiceTargetByFragment = new Map();
for (const [key, target] of Object.entries(targets)) {
  homepageServiceTargetByFragment.set(`procedure-${key}`, target);
  homepageServiceTargetByFragment.set(`service-${key}`, target);
}

export const homepageServiceTargets = [...homepageServiceTargetByFragment].map(([fragment, target]) => ({ fragment, target }));
