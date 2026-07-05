import type { ImageMetadata } from 'astro';

import doctorPortrait from '~/assets/custom/doctor-portrait.jpg';
import doctorExam from '~/assets/custom/doctor-exam.jpg';
import doctorWithStaff from '~/assets/custom/doctor-with-staff.jpg';
import clinicInterior from '~/assets/custom/clinic-interior.jpg';
import clinicInterior2 from '~/assets/custom/clinic-interior-2.jpg';
import clinicEnvironment3 from '~/assets/custom/clinic-environment-3.jpg';
import clinicCorridor from '~/assets/custom/clinic-corridor.jpg';
import clinicWaitingRoom from '~/assets/custom/clinic-waiting-room.jpg';

export interface PageMediaEntry {
  path: string;
  title: string;
  heroImage: ImageMetadata;
  heroAlt: string;
  supportImage: ImageMetadata;
  supportAlt: string;
  galleryImage: ImageMetadata;
  galleryAlt: string;
  imageCaption: string;
  supportCaption: string;
  galleryCaption: string;
  ogImagePath: string;
  videoLabel?: string;
}

export const pageMedia: Record<string, PageMediaEntry> = {
  '/': {
    path: '/',
    title: 'دکتر سعید قزلباش | پزشک زیبایی در کرمانشاه',
    heroImage: doctorPortrait,
    heroAlt: 'پرتره دکتر سعید قزلباش',
    supportImage: doctorExam,
    supportAlt: 'دکتر در حال معاینه و مشاوره در کلینیک',
    galleryImage: doctorWithStaff,
    galleryAlt: 'دکتر سعید قزلباش در کنار تیم کلینیک',
    imageCaption: 'تصویر اصلی هویت پزشک روی صفحه خانه.',
    supportCaption: 'تصویر مشاوره و معاینه برای نشان دادن رویکرد ارزیابی پیش از تصمیم.',
    galleryCaption: 'تصویر تکمیلی از پزشک و تیم برای تقویت هویت حرفه‌ای صفحه خانه.',
    ogImagePath: '/og/home.jpg',
    videoLabel: 'ویدئوهای آموزشی صفحه خانه در همین صفحه با متن قابل‌خزش و گراف VideoObject هم‌خوان شده‌اند.',
  },
  '/dr-saeed-ghezelbash-aesthetic-clinic/': {
    path: '/dr-saeed-ghezelbash-aesthetic-clinic/',
    title: 'درباره کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه',
    heroImage: clinicInterior,
    heroAlt: 'نمایی از فضای داخلی کلینیک زیبایی دکتر سعید قزلباش',
    supportImage: clinicWaitingRoom,
    supportAlt: 'فضای انتظار کلینیک زیبایی دکتر سعید قزلباش',
    galleryImage: clinicInterior2,
    galleryAlt: 'نمای تکمیلی از محیط داخلی کلینیک',
    imageCaption: 'نمای اصلی از محیط کلینیک برای صفحه هویت مکانی و سازمانی.',
    supportCaption: 'فضای انتظار برای نمایش تجربه حضور واقعی در کلینیک.',
    galleryCaption: 'نمای تکمیلی از محیط کلینیک برای تقویت لایه مکانی و اعتماد.',
    ogImagePath: '/og/clinic.jpg',
    videoLabel:
      'ویدئوی تجربه مراجعه و لایه هویت مکانی کلینیک در همین صفحه با متن قابل‌خزش و گراف VideoObject هم‌خوان شده است.',
  },
  '/botox-kermanshah/': {
    path: '/botox-kermanshah/',
    title: 'بوتاکس در کرمانشاه؛ تصمیم‌گیری، عوارض و ماندگاری',
    heroImage: doctorExam,
    heroAlt: 'دکتر در حال مشاوره برای بوتاکس',
    supportImage: doctorPortrait,
    supportAlt: 'پرتره دکتر برای صفحه راهنمای بوتاکس',
    galleryImage: clinicInterior,
    galleryAlt: 'نمای کلینیک برای صفحه بوتاکس',
    imageCaption: 'تصویر اصلی صفحه بوتاکس با تمرکز بر معاینه و تصمیم‌گیری.',
    supportCaption: 'پرتره پزشک برای تثبیت هویت صفحه بوتاکس.',
    galleryCaption: 'نمای کلینیک برای پشتیبانی از اعتماد و حضور واقعی صفحه بوتاکس.',
    ogImagePath: '/og/botox.jpg',
    videoLabel:
      'ویدئوی مرتبط با تفکیک بوتاکس از سابسیژن و مسیرهای غیرعضلانی در همین صفحه با متن قابل‌خزش هم‌خوان شده است.',
  },
  '/filler-kermanshah/': {
    path: '/filler-kermanshah/',
    title: 'تزریق فیلر در کرمانشاه؛ لب، زیر چشم، فک و ریسک‌ها',
    heroImage: doctorWithStaff,
    heroAlt: 'دکتر و تیم کلینیک برای تزریق فیلر',
    supportImage: clinicInterior2,
    supportAlt: 'نمای تکمیلی از محیط داخلی کلینیک',
    galleryImage: doctorPortrait,
    galleryAlt: 'پرتره دکتر برای صفحه فیلر',
    imageCaption: 'تصویر اصلی صفحه فیلر با تمرکز بر تیم درمان و فضای واقعی کلینیک.',
    supportCaption: 'نمای تکمیلی محیط برای افزایش اعتماد و تنوع رسانه‌ای صفحه فیلر.',
    galleryCaption: 'پرتره پزشک برای تقویت هویت حرفه‌ای صفحه فیلر.',
    ogImagePath: '/og/filler.jpg',
    videoLabel:
      'ویدئوهای نواحی فیلر، مرز تصمیم و ریسک نواحی حساس در همین صفحه با متن قابل‌خزش و segment layer هم‌خوان شده‌اند.',
  },
  '/thread-lift-kermanshah/': {
    path: '/thread-lift-kermanshah/',
    title: 'لیفت نخ در کرمانشاه؛ کاندید مناسب، عوارض و ماندگاری',
    heroImage: clinicEnvironment3,
    heroAlt: 'فضای کلینیک برای معرفی لیفت نخ',
    supportImage: clinicInterior,
    supportAlt: 'نمای تکمیلی کلینیک برای صفحه لیفت نخ',
    galleryImage: doctorExam,
    galleryAlt: 'مشاوره دکتر برای تصمیم‌گیری درباره لیفت نخ',
    imageCaption: 'تصویر اصلی صفحه لیفت نخ با تأکید بر فضای واقعی کلینیک.',
    supportCaption: 'نمای کلینیک برای تقویت لایه رسانه‌ای و preview صفحه لیفت نخ.',
    galleryCaption: 'تصویر مشاوره برای پیوند دادن لیفت نخ با انتخاب درست کاندید مناسب.',
    ogImagePath: '/og/thread-lift.jpg',
    videoLabel: 'ویدئوی لیفت نخ و کاندید مناسب در همین صفحه با متن قابل‌خزش و segment layer هم‌خوان شده است.',
  },
  '/aesthetic-concerns-kermanshah/': {
    path: '/aesthetic-concerns-kermanshah/',
    title: 'درمان مشکلات زیبایی در کرمانشاه؛ لک، جای جوش، مو و غبغب',
    heroImage: clinicCorridor,
    heroAlt: 'راهرو و فضای کلینیک برای تشخیص مشکلات زیبایی',
    supportImage: clinicWaitingRoom,
    supportAlt: 'فضای انتظار کلینیک برای صفحه مشکلات زیبایی',
    galleryImage: doctorWithStaff,
    galleryAlt: 'دکتر و تیم کلینیک برای صفحه مشکلات زیبایی',
    imageCaption: 'تصویر اصلی صفحه مشکلات زیبایی با تأکید بر فضای کلینیک و رویکرد تشخیصی.',
    supportCaption: 'تصویر تکمیلی از فضای انتظار برای واقعی‌تر شدن صفحه مشکلات زیبایی.',
    galleryCaption: 'تصویر پزشک و تیم برای تقویت هویت و اعتماد صفحه مشکلات زیبایی.',
    ogImagePath: '/og/concerns.jpg',
    videoLabel:
      'ویدئوهای مربوط به لک، سابسیژن و اسکین‌بوسترها در همین صفحه با متن قابل‌خزش و segment layer هم‌خوان شده‌اند.',
  },
};

export function getPageMedia(pathname: string) {
  return pageMedia[pathname] ?? pageMedia['/'];
}
