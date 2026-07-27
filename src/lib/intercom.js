import { show, update } from '@intercom/messenger-js-sdk';

export function openIntercom() {
  try {
    show();
  } catch (error) {
    console.error('Unable to open Intercom:', error);
  }
}

export function setIntercomLauncherVisibility(visible) {
  try {
    update({
      alignment: 'right',
      horizontal_padding: 20,
      vertical_padding: 20,
      hide_default_launcher: !visible,
    });
  } catch (error) {
    console.error('Unable to update Intercom:', error);
  }
}
