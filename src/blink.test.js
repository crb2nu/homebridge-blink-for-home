const {describe, expect, test} = require('@jest/globals');
const {setLogger} = require('./log');
const logger = () => {};
logger.log = () => {};
logger.error = console.error;
setLogger(logger, false, false);
const {Blink} = require('./blink');
const SAMPLE = require('./blink-api.sample');

jest.mock('./blink-api');

const DEFAULT_BLINK_CLIENT_UUID = 'A5BF5C52-56F3-4ADB-A7C2-A70619552084';

describe('Blink', () => {
    test.concurrent('authenticate()', async () => {
        const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
        blink.blinkAPI.login.mockResolvedValue({});
        await blink.authenticate();
        expect(blink.blinkAPI.login).toHaveBeenCalled();
    });
    test.concurrent('refreshData()', async () => {
        const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
        blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
        await blink.refreshData();
        expect(blink.blinkAPI.getAccountHomescreen).toHaveBeenCalled();
        expect(blink.networks.size).toBe(3);
        expect(blink.cameras.size).toBe(3);
    });
    test.concurrent('_commandWait()', async() => {
        const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
        blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
        await blink.refreshData();

        blink.blinkAPI.getCommand.mockResolvedValue(SAMPLE.COMMAND_RUNNING);
        blink.blinkAPI.deleteCommand.mockResolvedValue({});
        const {id: commandID, network_id: networkID} = SAMPLE.COMMAND_RUNNING.commands[0];
        await blink._commandWait(networkID, commandID, 0.0001);

        expect(blink.blinkAPI.getCommand).toBeCalledTimes(2);
        expect(blink.blinkAPI.deleteCommand).toBeCalledTimes(1);

        expect(await blink._commandWait(networkID)).toBeUndefined();
        expect(await blink._commandWait(null, commandID)).toBeUndefined();
    });
    describe('BlinkCamera', () => {
        test.concurrent('.data', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            await blink.refreshData();
            await blink.refreshData(); // second call from cache
            expect(blink.blinkAPI.getAccountHomescreen).toBeCalledTimes(2);
        });
        test.concurrent('.props', async () => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            blink.blinkAPI.getCameraStatus.mockResolvedValue(SAMPLE.CAMERA_STATUS);
            blink.blinkAPI.getMediaChange.mockResolvedValue(SAMPLE.MEDIA_CHANGE);

            await blink.refreshData();

            const cameraData = SAMPLE.HOMESCREEN.CAMERA_OG;
            cameraData.updated_at = new Date().toISOString();

            const cameraDevice = blink.cameras.get(cameraData.id);
            const networkDevice = blink.networks.get(cameraData.network_id);
            expect(cameraDevice.networkID).toBe(cameraData.network_id);
            expect(cameraDevice.network).toBe(networkDevice);
            expect(cameraDevice.canonicalID).toBeDefined();
            expect(cameraDevice.status).toBe('online');
            expect(cameraDevice.model).toBe('white');
            expect(cameraDevice.serial).toBe('120040563');
            expect(cameraDevice.firmware).toBe('2.151');
            expect(cameraDevice.isCameraMini).toBe(false);
            expect(cameraDevice.thumbnailCreatedAt).toBe(Date.parse('2020-01-01T01:01:00.000Z'));
            expect(cameraDevice.thumbnailCreatedAt).toBe(Date.parse('2020-01-01T01:01:00.000Z'));
            expect(cameraDevice.isBatteryPower).toBe(true);
            expect(cameraDevice.lowBattery).toBe(false);
            expect(await cameraDevice.getBattery()).toBe(73);
            expect(await cameraDevice.getWifiSSR()).toBe(-52);
            expect(cameraDevice.getTemperature()).toBe(16.7);
            expect(cameraDevice.getTemperature()).toBe(16.7);
            expect(cameraDevice.armed).toBe(true);
            expect(cameraDevice.enabled).toBe(true);
            expect(cameraDevice.getEnabled()).toBe(true);
            expect(cameraDevice.getMotionDetectActive()).toBe(true);

            expect(await cameraDevice.getMotionDetected()).toBe(false);

            // update timestamp
            const newMediaChange = JSON.parse(JSON.stringify(SAMPLE.MEDIA_CHANGE));
            newMediaChange.media[0].created_at = new Date().toISOString();
            blink.blinkAPI.getMediaChange.mockResolvedValue(newMediaChange);
            expect(await cameraDevice.getMotionDetected()).toBe(true);

            cameraDevice.privacyMode = true;
            expect(cameraDevice.privacyMode).toBe(true);

            const miniCameraData = SAMPLE.HOMESCREEN.cameras[2];
            const miniCameraDevice = blink.cameras.get(miniCameraData.id);
            expect(miniCameraDevice.isCameraMini).toBe(true);
            expect(miniCameraDevice.isBatteryPower).toBe(false);
            expect(miniCameraDevice.lowBattery).toBeNull();
            expect(await miniCameraDevice.getBattery()).toBeNull();
            expect(await miniCameraDevice.getWifiSSR()).toBeNull();
            expect(miniCameraDevice.getTemperature()).toBeNull();
            expect(miniCameraDevice.armed).toBe(false);
            expect(miniCameraDevice.enabled).toBe(true);
            expect(miniCameraDevice.getEnabled()).toBe(true);
            expect(miniCameraDevice.getMotionDetectActive()).toBe(false);
            expect(await miniCameraDevice.getMotionDetected()).toBe(false);
        });

        test.concurrent.each([
            [false, false, false, false, 0, 0],
            [false, false, true, false, 0, 0],
            [false, false, false, true, 0, 0],
            [false, false, true, true, Date.now(), 0],
            [false, true, true, true, 0, 1],
            [true, true, true, true, 0, 1],
        ])('BlinkCamera.refreshThumbnail()', async (mini, force, armed, enabled, thumbnailDate, expected) => {
            const blink = new Blink(DEFAULT_BLINK_CLIENT_UUID);
            blink.blinkAPI.getAccountHomescreen.mockResolvedValue(SAMPLE.HOMESCREEN);
            blink.blinkAPI.updateCameraThumbnail.mockResolvedValue(SAMPLE.UPDATE_THUMBNAIL);
            blink.blinkAPI.updateOwlThumbnail.mockResolvedValue(SAMPLE.UPDATE_THUMBNAIL);
            blink.blinkAPI.getCommand.mockResolvedValue(SAMPLE.COMMAND_COMPLETE);
            await blink.refreshData();

            const cameraData = mini ? SAMPLE.HOMESCREEN.MINI : SAMPLE.HOMESCREEN.CAMERA_OG;
            const cameraDevice = blink.cameras.get(cameraData.id);
            cameraDevice.network.data.armed = armed;
            cameraDevice.data.enabled = enabled;
            if (thumbnailDate) cameraDevice.thumbnailCreatedAt = thumbnailDate;

            await cameraDevice.refreshThumbnail(force);

            expect(blink.blinkAPI.updateCameraThumbnail).toBeCalledTimes(!mini ? expected : 0);
            expect(blink.blinkAPI.updateOwlThumbnail).toBeCalledTimes(mini ? expected : 0);
            expect(blink.blinkAPI.getCommand).toBeCalledTimes(expected);
            expect(blink.blinkAPI.getAccountHomescreen).toBeCalledTimes(expected + 1);
        });
    });
});
