import { getPermalink } from './utils/permalinks';
import { contactData } from './data/contact';

export const headerData = {
  links: [
    { text: 'خانه', href: getPermalink('/') },
    { text: 'درباره کلینیک', href: getPermalink('/dr-saeed-ghezelbash-aesthetic-clinic') },
    {
      text: 'خدمات',
      links: [
        { text: 'بوتاکس در کرمانشاه', href: getPermalink('/botox-kermanshah') },
        { text: 'تزریق فیلر در کرمانشاه', href: getPermalink('/filler-kermanshah') },
        { text: 'لیفت نخ در کرمانشاه', href: getPermalink('/thread-lift-kermanshah') },
        { text: 'درمان مشکلات زیبایی', href: getPermalink('/aesthetic-concerns-kermanshah') },
      ],
    },
  ],
  actions: [
    { text: 'تماس', href: `tel:${contactData.phone}` },
    { text: 'نمونه‌کارها', href: contactData.instagram, target: '_blank' },
  ],
};

export const footerData = {
  links: [
    {
      title: 'صفحات اصلی',
      links: [
        { text: 'خانه', href: getPermalink('/') },
        { text: 'درباره کلینیک', href: getPermalink('/dr-saeed-ghezelbash-aesthetic-clinic') },
        { text: 'درمان مشکلات زیبایی', href: getPermalink('/aesthetic-concerns-kermanshah') },
      ],
    },
    {
      title: 'مگاپیلارهای خدمات',
      links: [
        { text: 'بوتاکس در کرمانشاه', href: getPermalink('/botox-kermanshah') },
        { text: 'تزریق فیلر در کرمانشاه', href: getPermalink('/filler-kermanshah') },
        { text: 'لیفت نخ در کرمانشاه', href: getPermalink('/thread-lift-kermanshah') },
      ],
    },
    {
      title: 'اطلاعات کلینیک',
      links: [
        { text: contactData.phoneDisplay, href: `tel:${contactData.phone}` },
        { text: contactData.address, href: contactData.googleMap, target: '_blank' },
        { text: contactData.openingHours, href: getPermalink('/dr-saeed-ghezelbash-aesthetic-clinic') },
      ],
    },
  ],
  secondaryLinks: [
    { text: 'تماس با کلینیک', href: `tel:${contactData.phone}` },
    { text: 'مسیریابی', href: contactData.googleMap, target: '_blank' },
  ],
  socialLinks: [
    { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: contactData.instagram },
    { ariaLabel: 'Google Maps', icon: 'tabler:map-pin', href: contactData.googleMap },
  ],
  footNote: `
    © کلینیک زیبایی دکتر سعید قزلباش — کرمانشاه. اطلاعات سایت جایگزین معاینه و تشخیص پزشکی نیست.
  `,
};
