package cl.elpollon.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DriverBadge")
public class DriverBadgePlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        int count = 0;
        try {
            Integer v = call.getInt("count");
            if (v != null) count = v;
        } catch (Exception ignored) {}
        BadgeHelper.apply(getContext(), count);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        BadgeHelper.apply(getContext(), 0);
        call.resolve();
    }
}
